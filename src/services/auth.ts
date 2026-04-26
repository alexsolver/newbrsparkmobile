import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearRoomListCache } from './chatOfflineStorage';
import { clearLocalDatabase } from '../database';
import { deleteAvatarCache, mergeServerUserWithLocalAvatar } from './avatarLocalCache';
import {
  createEmergencyOfflineBackup,
  restoreEmergencyOfflineBackupForUser,
} from './offlineRecoveryBackup';
import {
  OPS_CHAT_ACK_LOGOUT_BACKUP_KEY,
  backupOpsChatAcksForLogout,
  restoreOpsChatAcksAfterLogin,
} from '../lib/opsChatAckLocal';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform, Alert } from 'react-native';

async function getDeviceId(): Promise<string> {
  try {
    if (Platform.OS === 'android') {
      return Application.getAndroidId();
    } else if (Platform.OS === 'ios') {
      return (await Application.getIosIdForVendorAsync()) || 'unknown_ios';
    }
  } catch (e) {
    console.warn('Failed to get device id', e);
  }
  return Device.osBuildId || 'unknown_device';
}

// ─── Config ──────────────────────────────────────────────────────────────────
/** Porta da API (admin-panel/backend + PostgreSQL). */
const DEV_API_PORT = process.env.EXPO_PUBLIC_API_PORT || '3001';

const ENV_DEV_HOST =
  String(
    (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEV_API_HOST) ||
      (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_API_HOST) ||
      '',
  ).trim();

function pushHostCandidate(out: string[], raw: unknown) {
  if (raw && typeof raw === 'string' && raw.trim()) out.push(raw.trim());
}

/** URIs que o Expo preenche com o host do packager (LAN, túnel, etc.). */
function collectExpoBundlerHostUris(): string[] {
  const uris: string[] = [];
  try {
    pushHostCandidate(uris, Constants.expoConfig?.hostUri);
    const m = Constants.manifest;
    if (m && typeof m === 'object' && m !== null && 'debuggerHost' in m) {
      pushHostCandidate(uris, (m as { debuggerHost?: string }).debuggerHost);
    }
    const m2 = Constants.manifest2 as { extra?: { expoClient?: { hostUri?: string } } } | null | undefined;
    pushHostCandidate(uris, m2?.extra?.expoClient?.hostUri);
  } catch {
    /* ignore */
  }
  return uris;
}

/** Host Metro/Expo (mesmo PC que corre `expo start`) — evita IP fixo errado na Wi‑Fi. */
function inferExpoDevLanHost(): string | null {
  try {
    for (const raw of collectExpoBundlerHostUris()) {
      const host = raw.split(':')[0]?.trim();
      if (!host || host === 'localhost' || host === '127.0.0.1') continue;
      if (!isLikelyLocalLanApiBase(`http://${host}:${DEV_API_PORT}`)) continue;
      return host;
    }
  } catch {
    /* ignore */
  }
  return null;
}

const FALLBACK_LAN_IP = '192.168.15.73';
const MAC_IP = ENV_DEV_HOST || inferExpoDevLanHost() || FALLBACK_LAN_IP;

/** Origem da API em release: só esquema+host (+porta se preciso). Sem `/api` no fim (o app acrescenta `/api/...`). */
function normalizeProductionApiBase(raw: string | undefined): string | undefined {
  if (raw == null || typeof raw !== 'string') return undefined;
  let u = raw.trim().replace(/\/+$/, '');
  if (u.toLowerCase().endsWith('/api')) {
    u = u.slice(0, -4).replace(/\/+$/, '');
  }
  return u.length > 0 ? u : undefined;
}

const PRODUCTION_API_DEFAULT = 'https://api.brspark.com';

const fromEnvRaw = normalizeProductionApiBase(process.env.EXPO_PUBLIC_API_BASE);
/** Em dev, permite forçar produção: `EXPO_PUBLIC_USE_PRODUCTION_API=1` no .env (e `EXPO_PUBLIC_API_BASE` se quiser outro host). */
const forceProductionInDev =
  __DEV__ && String(process.env.EXPO_PUBLIC_USE_PRODUCTION_API || '').trim() === '1';

/**
 * Em dispositivo físico, `http://localhost:3001` / `127.0.0.1` na API apontam para o próprio telemóvel.
 * Se o Metro expõe um host LAN em `expoConfig.hostUri`, substituímos por esse host (mantém a porta do `.env`).
 * Em simulador/emulador, sem host LAN do Expo, mantém-se loopback (acesso ao host da máquina).
 * Em **dispositivo físico**, se ainda não houver host do Metro, usa `EXPO_PUBLIC_DEV_API_HOST` ou o IP fallback do projeto.
 */
function rewriteDevLoopbackApiBaseIfNeeded(apiBase: string): string {
  if (!__DEV__ || Platform.OS === 'web') return apiBase;
  try {
    const u = new URL(String(apiBase || '').trim());
    const h = u.hostname.toLowerCase();
    if (h !== 'localhost' && h !== '127.0.0.1') return apiBase;
    let lanHost = inferExpoDevLanHost();
    if (!lanHost && Device.isDevice) {
      const eh = ENV_DEV_HOST.replace(/^https?:\/\//i, '').split(':')[0]?.trim();
      if (eh && eh !== 'localhost' && eh !== '127.0.0.1') lanHost = eh;
    }
    if (!lanHost && Device.isDevice) {
      lanHost = FALLBACK_LAN_IP;
    }
    if (!lanHost) return apiBase;
    const portPart = u.port ? `:${u.port}` : '';
    const next = `${u.protocol}//${lanHost}${portPart}`.replace(/\/+$/, '');
    const prev = apiBase.replace(/\/+$/, '');
    if (next !== prev) {
      console.warn('[BrSpark] API_BASE em loopback no dispositivo — redirecionado para o host LAN:', prev, '→', next);
    }
    return next;
  } catch {
    return apiBase;
  }
}

function isLikelyLocalLanApiBase(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '10.0.2.2') return true;
    if (h.startsWith('192.168.')) return true;
    const p = h.split('.').map((x) => Number(x));
    return p.length === 4 && p[0] === 10 && p.every((n) => !Number.isNaN(n));
  } catch {
    return false;
  }
}

/**
 * Base da API (origem sem `/api` no fim).
 * - **Release:** `EXPO_PUBLIC_API_BASE` (EAS / build) ou produção por defeito.
 * - **Dev:** se existir `EXPO_PUBLIC_API_BASE` no `.env`, usa-se sempre (LAN, VPN, https público, túnel).
 *   Sem isso: `EXPO_PUBLIC_DEV_API_HOST` → host inferido do Metro (`expoConfig.hostUri`) → IP fallback + porta.
 *   `EXPO_PUBLIC_USE_PRODUCTION_API=1` força produção como antes.
 *   Se `EXPO_PUBLIC_API_BASE` for loopback e o Metro indicar host LAN, substitui-se automaticamente (evita erro no telemóvel).
 */
const RESOLVED_API_BASE: string = (() => {
  if (__DEV__) {
    if (forceProductionInDev) {
      return rewriteDevLoopbackApiBaseIfNeeded(fromEnvRaw || PRODUCTION_API_DEFAULT);
    }
    if (fromEnvRaw) {
      return rewriteDevLoopbackApiBaseIfNeeded(fromEnvRaw);
    }
    return rewriteDevLoopbackApiBaseIfNeeded(`http://${MAC_IP}:${DEV_API_PORT}`);
  }
  return fromEnvRaw || PRODUCTION_API_DEFAULT;
})();

export const API_BASE = RESOLVED_API_BASE;

if (__DEV__) {
  console.log('[BrSpark] API_BASE →', API_BASE);
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  /** Matrícula funcional (RH / ponto), única por organização quando definida no painel. */
  employeeMatricula?: string | null;
  role: string;
  /** Idioma preferido para ver traduções no chat (BCP-47); null = automático (tenant / app). */
  preferredChatLocale?: string | null;
  avatarUrl?: string;
  /** file:// após cache local (offline) */
  avatarLocalUri?: string;
  addressJson?: {
    line1?: string | null;
    line2?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    countryCode?: string | null;
  } | null;
  tenant?: {
    id: string;
    name: string;
    /** COMPANY | CLIENT | PROVIDER — modelo de visibilidade de ativos e sync. */
    kind?: string | null;
    /** Nome de exibição da organização (painel); pode diferir de `name` (razão social / interno). */
    ownerName?: string | null;
    status: string;
    /** Preferência para campos «Visão de IA — detecção»: API Moondream vs proxy YOLO (painel / tenant.features). */
    visionDetectionEngine?: 'yolo' | 'moondream';
    branding?: {
      enabled?: boolean;
      appDisplayName?: string;
      tagline?: string;
      primaryColor?: string;
      accentColor?: string;
      secondaryColor?: string;
      surfaceColor?: string;
      menuChipActiveBg?: string;
      menuChipActiveFg?: string;
      menuChipInactiveBg?: string;
      menuChipInactiveFg?: string;
      menuChipInactiveBorder?: string;
      logoLightUrl?: string;
      logoDarkUrl?: string;
      loginBackgroundUrl?: string;
      brandingVersion?: number;
      updatedAt?: string | null;
    };
  };
  technicianProfile?: {
    id: string;
    status: string;
    score: number;
    cft?: string;
    specialty?: string;
    /** Ver schema Prisma — turnos por dia. */
    workScheduleJson?: Record<string, unknown> | null;
    /** IDs de `Location` do tenant. */
    serviceLocationIds?: string[] | null;
    serviceCoverageGeoJson?: {
      homeBase?: {
        latitude: number;
        longitude: number;
        address?: string | null;
        city?: string | null;
        state?: string | null;
        postalCode?: string | null;
        countryCode?: string | null;
      } | null;
      radiusKm?: number | null;
      notes?: string | null;
      updatedAt?: string | null;
    } | null;
  };
  /** Documentos pessoais (painel) — ex.: identificador para exibição em ponto. */
  personalDocuments?: Array<{ identifier?: string; docType?: string; label?: string }>;
  appContext?: {
    scope: string;
    contextTenantId?: string | null;
    capabilities?: string[];
  };
}

/** Prestador habilitado a receber OS (backend exige `TechnicianProfile.status === ACTIVE`). */
export function isTechnicianProfileActive(user: User | null | undefined): boolean {
  return String(user?.technicianProfile?.status || '').toUpperCase() === 'ACTIVE';
}

/** Papel na API — pode receber OS/FT e RT no servidor (todos exceto cliente `USER`). */
export function isFieldTaskEligibleRole(role: string | null | undefined): boolean {
  const r = String(role || '').toUpperCase();
  return r === 'PROVIDER' || r === 'MANAGER' || r === 'TENANT_ADMIN' || r === 'SAAS_ADMIN';
}

/**
 * Conta de consumidor B2C: papel `USER` sem `technicianProfile`.
 * Não deve herdar afinações de prestador (capability `mobile.mode.provider` por engano, etc.).
 */
export function isB2CConsumerUser(user: User | null | undefined): boolean {
  return String(user?.role || '').toUpperCase() === 'USER' && !user?.technicianProfile;
}

/** Modo «campo / prestador» no app: perfil técnico ativo ou conta interna não-cliente. */
export function canUseFieldWorkAppRole(user: User | null | undefined): boolean {
  return isTechnicianProfileActive(user) || isFieldTaskEligibleRole(user?.role);
}

export function userHasCapability(user: User | null | undefined, capability: string): boolean {
  const caps = Array.isArray(user?.appContext?.capabilities) ? user.appContext.capabilities : [];
  return caps.includes(String(capability || '').trim());
}

/** Verdade efetiva do backend para entrar no modo prestador dentro do app. */
export function canUseProviderMode(user: User | null | undefined): boolean {
  return userHasCapability(user, 'mobile.mode.provider');
}

/** Erro especial lançado quando o backend exige 2FA */
export class TwoFactorRequired extends Error {
  challengeToken: string;
  constructor(challengeToken: string) {
    super('two_factor_required');
    this.name = 'TwoFactorRequired';
    this.challengeToken = challengeToken;
  }
}

export type LoginTenantOption = {
  id: string;
  name?: string | null;
  slug?: string | null;
  /** COMPANY | CLIENT | PROVIDER — vem da API de login. */
  kind?: string | null;
};

/** Resposta de `GET /api/me/sibling-workspaces` (troca de organização no perfil). */
export type SiblingWorkspaceOption = LoginTenantOption & {
  memberCount?: number;
  isCurrent?: boolean;
};

export class MultipleAccountsError extends Error {
  tenants: LoginTenantOption[];
  constructor(tenants: LoginTenantOption[]) {
    super('multiple_accounts');
    this.name = 'MultipleAccountsError';
    this.tenants = tenants;
  }
}

const TOKEN_KEY = 'brspark_jwt';
const USER_KEY  = 'brspark_user';
/** Branding efectivo da última sessão — ecrã de login sem JWT ainda mostra logo/cores até novo login. */
export const GUEST_LOGIN_BRANDING_KEY = '@brspark:guest_login_branding_v1';
/** Não apagar no purge — evita re-disparar migração nuclear em `_layout` a cada login. */
const ISOLATION_VERSION_KEY = '@brspark:isolation_v';
/** Marcador temporário quando a sessão expira/sessão invalidada para reter dados offline até novo login da mesma conta. */
const PRESERVED_LOCAL_OWNER_KEY = '@brspark_preserved_local_owner_v1';

type PreservedLocalOwner = {
  id: string;
  email: string;
  tenantId: string;
  at: number;
  reason?: string;
};

function normalizeIdentityPart(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

function userIdentityFingerprint(u: Partial<User> | null | undefined): string {
  const id = normalizeIdentityPart((u as any)?.id);
  const email = normalizeIdentityPart((u as any)?.email);
  const tenantId = normalizeIdentityPart((u as any)?.tenantId);
  return `${id}|${email}|${tenantId}`;
}

/**
 * Remove caches BrSpark em AsyncStorage (OS, rascunhos, filas, dados por e-mail, etc.) e SQLite local.
 * Preserva apenas `ISOLATION_VERSION_KEY` (controle de migração de isolamento no arranque).
 */
export async function purgeAllBrSparkLocalCaches(): Promise<void> {
  let isolation: string | null = null;
  try {
    isolation = await AsyncStorage.getItem(ISOLATION_VERSION_KEY);
  } catch {
    /* ignore */
  }

  let keys: string[] = [];
  try {
    const all = await AsyncStorage.getAllKeys();
    keys = all && all.length ? [...all] : [];
  } catch {
    keys = [];
  }

  const toRemove = keys.filter((k) => {
    if (!k) return false;
    if (k === ISOLATION_VERSION_KEY) return false;
    if (k === OPS_CHAT_ACK_LOGOUT_BACKUP_KEY) return false;
    if (k === TOKEN_KEY || k === USER_KEY) return true;
    if (k.startsWith('@brspark')) return true;
    if (k.startsWith('brspark_')) return true;
    if (k.startsWith('@draft_tsk_')) return true;
    if (k === '@user_profile' || k === '@pref_push_enabled') return true;
    return false;
  });

  if (toRemove.length > 0) {
    await AsyncStorage.multiRemove(toRemove);
  }

  if (isolation != null && isolation !== '') {
    try {
      await AsyncStorage.setItem(ISOLATION_VERSION_KEY, isolation);
    } catch {
      /* ignore */
    }
  }

  clearLocalDatabase();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

// ─── AuthService ─────────────────────────────────────────────────────────────
export class AuthService {
  static async tryAutoRestoreOfflineBackup(user: User | null): Promise<void> {
    if (!user) return;
    try {
      const r = await restoreEmergencyOfflineBackupForUser(user);
      if (r.restored) {
        console.log(
          `[AUTH] Backup offline restaurado automaticamente (keys=${r.restoredKeys}, syncQueue=${r.restoredQueueRows}).`,
        );
      }
    } catch (e) {
      console.warn('[AUTH] Falha ao restaurar backup offline:', e);
    }
  }

  /** Após gravar JWT + utilizador: acks do chat operacional (purge no logout) + backup de emergência. */
  static async restorePostLoginLocalState(user: User | null): Promise<void> {
    if (user) await restoreOpsChatAcksAfterLogin(user);
    await AuthService.tryAutoRestoreOfflineBackup(user);
  }

  static async savePreservedLocalOwner(user: User | null, reason?: string): Promise<void> {
    if (!user) return;
    const owner: PreservedLocalOwner = {
      id: String(user.id || '').trim(),
      email: String(user.email || '').trim().toLowerCase(),
      tenantId: String(user.tenantId || '').trim(),
      at: Date.now(),
      reason: reason ? String(reason) : undefined,
    };
    try {
      await AsyncStorage.setItem(PRESERVED_LOCAL_OWNER_KEY, JSON.stringify(owner));
    } catch {
      /* ignore */
    }
  }

  static async clearPreservedLocalOwner(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PRESERVED_LOCAL_OWNER_KEY);
    } catch {
      /* ignore */
    }
  }

  static async loadPreservedLocalOwner(): Promise<PreservedLocalOwner | null> {
    try {
      const raw = await AsyncStorage.getItem(PRESERVED_LOCAL_OWNER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PreservedLocalOwner;
      if (!parsed || typeof parsed !== 'object') return null;
      if (!parsed.id || !parsed.email || !parsed.tenantId) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /** Avatar do usuário anterior + purge total antes de gravar nova sessão (mesmo aparelho, outra conta). */
  static async wipeLocalDataBeforeNewSession(nextUser?: User | null): Promise<void> {
    const preserved = await AuthService.loadPreservedLocalOwner();
    if (nextUser && preserved) {
      const sameUser =
        userIdentityFingerprint(nextUser) ===
        userIdentityFingerprint({
          id: preserved.id,
          email: preserved.email,
          tenantId: preserved.tenantId,
        } as Partial<User>);
      if (sameUser) {
        console.log('[AUTH] Sessão restaurada para a mesma conta: preservando dados offline locais.');
        await AuthService.clearPreservedLocalOwner();
        const uid = String(nextUser.id || '').trim();
        if (uid) await clearRoomListCache(uid);
        return;
      }
    }

    const existing = await AuthService.getUser();
    if (existing?.id) {
      try {
        await createEmergencyOfflineBackup(existing, 'new_session_purge');
      } catch {
        /* ignore */
      }
      try {
        await deleteAvatarCache(existing.id);
      } catch {
        /* ignore */
      }
    }
    await AuthService.clearPreservedLocalOwner();
    await purgeAllBrSparkLocalCaches();
  }

  /** Login — POST /api/login */
  static async login(
    email: string,
    password: string,
    tenantId?: string | null,
  ): Promise<User> {
    const deviceId = await getDeviceId();
    const body: Record<string, unknown> = {
      email: email.trim().toLowerCase(),
      password,
      deviceId,
    };
    if (tenantId && String(tenantId).trim()) {
      body.tenantId = String(tenantId).trim();
    }
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 409 && data?.code === 'MULTIPLE_ACCOUNTS' && Array.isArray(data?.tenants)) {
        throw new MultipleAccountsError(data.tenants as LoginTenantOption[]);
      }
      throw new Error(data.error || 'Erro ao fazer login.');
    }

    // Fluxo 2FA: backend pede confirmação via OTP
    if (data.requiresTwoFactor && data.challengeToken) {
      throw new TwoFactorRequired(data.challengeToken);
    }

    await AuthService.wipeLocalDataBeforeNewSession(data.user as User);
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    await AuthService.restorePostLoginLocalState(data.user as User);
    return data.user as User;
  }

  /**
   * Login social — identidade validada no Laravel; sessão emitida pelo Node (`POST /api/login/oauth`).
   * Envie `idToken` (Google / Apple) ou `accessToken` (Facebook) conforme o SDK nativo.
   */
  static async loginWithOAuth(params: {
    provider: 'google' | 'facebook' | 'apple';
    idToken?: string;
    accessToken?: string;
    tenantId?: string | null;
  }): Promise<User> {
    const deviceId = await getDeviceId();
    const body: Record<string, unknown> = {
      provider: params.provider,
      deviceId,
    };
    if (params.idToken && String(params.idToken).trim()) {
      body.idToken = String(params.idToken).trim();
    }
    if (params.accessToken && String(params.accessToken).trim()) {
      body.accessToken = String(params.accessToken).trim();
    }
    if (params.tenantId && String(params.tenantId).trim()) {
      body.tenantId = String(params.tenantId).trim();
    }

    const res = await fetch(`${API_BASE}/api/login/oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 409 && data?.code === 'MULTIPLE_ACCOUNTS' && Array.isArray(data?.tenants)) {
        throw new MultipleAccountsError(data.tenants as LoginTenantOption[]);
      }
      throw new Error(data.error || 'Erro ao fazer login social.');
    }

    if (data.requiresTwoFactor && data.challengeToken) {
      throw new TwoFactorRequired(String(data.challengeToken));
    }

    await AuthService.wipeLocalDataBeforeNewSession(data.user as User);
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    await AuthService.restorePostLoginLocalState(data.user as User);
    return data.user as User;
  }

  /** Bases de despacho (Location) do tenant — horários e regiões. */
  static async getTechnicianServiceBases(): Promise<
    Array<{ id: string; name: string; type?: string; address?: string | null; latitude?: number | null; longitude?: number | null }>
  > {
    const token = await getToken();
    if (!token) return [];
    const res = await fetch(`${API_BASE}/api/me/technician-service-bases`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({}))) as { locations?: unknown[] };
    if (!res.ok || !Array.isArray(data?.locations)) return [];
    return data.locations as Array<{
      id: string;
      name: string;
      type?: string;
      address?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    }>;
  }

  /** Lista outras organizações do mesmo e-mail (para trocar no perfil). */
  static async listSiblingWorkspaces(): Promise<SiblingWorkspaceOption[]> {
    const token = await getToken();
    if (!token) return [];
    const res = await fetch(`${API_BASE}/api/me/sibling-workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as { workspaces?: SiblingWorkspaceOption[] };
    if (!res.ok || !Array.isArray(data?.workspaces)) return [];
    return data.workspaces;
  }

  /** Troca JWT para o utilizador do mesmo e-mail noutro tenant (POST /api/me/switch-workspace). */
  static async switchWorkspace(tenantId: string): Promise<User> {
    const token = await getToken();
    if (!token) throw new Error('Sessão inválida. Faça login novamente.');
    const deviceId = await getDeviceId();
    const res = await fetch(`${API_BASE}/api/me/switch-workspace`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tenantId: String(tenantId || '').trim(), deviceId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || 'Não foi possível mudar de organização.');
    }
    await AuthService.wipeLocalDataBeforeNewSession(data.user as User);
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    await AuthService.restorePostLoginLocalState(data.user as User);
    return data.user as User;
  }

  /**
   * Cria uma nova organização (tenant) CLIENT ou PROVIDER com o mesmo e-mail e senha,
   * e altera a sessão para o novo utilizador (POST /api/me/workspaces).
   */
  static async createWorkspace(kind: 'CLIENT' | 'PROVIDER'): Promise<User> {
    const token = await getToken();
    if (!token) throw new Error('Sessão inválida. Faça login novamente.');
    const deviceId = await getDeviceId();
    const res = await fetch(`${API_BASE}/api/me/workspaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ kind, deviceId }),
    });
    const data = await res.json();
    if (!res.ok) {
      const tid = (data as { tenantId?: string }).tenantId;
      if (res.status === 409 && tid) {
        return AuthService.switchWorkspace(String(tid).trim());
      }
      throw new Error((data as { error?: string }).error || 'Não foi possível criar o espaço.');
    }
    await AuthService.wipeLocalDataBeforeNewSession(data.user as User);
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    await AuthService.restorePostLoginLocalState(data.user as User);
    return data.user as User;
  }

  static async startOtpAuth(params: {
    identifier: string;
    purpose?: 'login' | 'register';
    name?: string;
    /** Obrigatório com `purpose: register`: telefone em formato nacional ou internacional (o OTP vai só para o e-mail). */
    phone?: string;
  }): Promise<{ challengeId: string; channel: string; expiresInSec: number; devCode?: string }> {
    const body: Record<string, unknown> = {
      identifier: params.identifier.trim(),
      purpose: params.purpose || 'login',
      name: params.name,
    };
    if (params.phone != null && String(params.phone).trim()) {
      body.phone = String(params.phone).trim();
    }
    const res = await fetch(`${API_BASE}/api/otp-auth/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || 'Não foi possível enviar o código.');
    }
    return {
      challengeId: String((data as { challengeId: string }).challengeId),
      channel: String((data as { channel: string }).channel),
      expiresInSec: Number((data as { expiresInSec: number }).expiresInSec) || 600,
      devCode: (data as { devCode?: string }).devCode,
    };
  }

  static async verifyOtpAndLogin(params: {
    challengeId: string;
    code: string;
    name?: string;
  }): Promise<User> {
    const deviceId = await getDeviceId();
    const res = await fetch(`${API_BASE}/api/otp-auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: params.challengeId,
        code: params.code.trim(),
        name: params.name,
        deviceId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        (data as { error?: string }).error || (data as { code?: string }).code || 'Código inválido.',
      );
    }
    const d = data as { token: string; user: User };
    await AuthService.wipeLocalDataBeforeNewSession(d.user);
    await AsyncStorage.setItem(TOKEN_KEY, d.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(d.user));
    await AuthService.restorePostLoginLocalState(d.user);
    return d.user;
  }

  /** OTP de registo — valida código sem criar sessão; devolve token para o passo da senha. */
  static async verifyRegisterOtpPhase1(params: {
    challengeId: string;
    code: string;
    name?: string;
  }): Promise<{ setupToken: string }> {
    const res = await fetch(`${API_BASE}/api/otp-auth/register-verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: params.challengeId,
        code: params.code.trim(),
        name: params.name,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        (data as { error?: string }).error || (data as { code?: string }).code || 'Código inválido.',
      );
    }
    const setupToken = String((data as { setupToken?: string }).setupToken || '');
    if (!setupToken) {
      throw new Error('Resposta inválida do servidor.');
    }
    return { setupToken };
  }

  /** Finaliza registo após OTP (senha + consentimento LGPD/GDPR). */
  static async completeRegisterAfterOtpSetup(params: {
    setupToken: string;
    password: string;
    consent: boolean;
  }): Promise<User> {
    const deviceId = await getDeviceId();
    const res = await fetch(`${API_BASE}/api/otp-auth/register-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setupToken: params.setupToken,
        password: params.password,
        consent: params.consent,
        deviceId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || (data as { code?: string }).code || 'Erro ao criar conta.');
    }
    const d = data as { token: string; user: User };
    await AuthService.wipeLocalDataBeforeNewSession(d.user);
    await AsyncStorage.setItem(TOKEN_KEY, d.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(d.user));
    await AuthService.restorePostLoginLocalState(d.user);
    return d.user;
  }

  /** Registro — POST /api/register (utilizador USER na tenant master BrSpark) */
  static async register(params: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    consent: boolean;
  }): Promise<User> {
    if (!params.consent) {
      throw new Error('Você deve aceitar os Termos de Uso e a Política de Privacidade.');
    }

    const deviceId = await getDeviceId();
    const res = await fetch(`${API_BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:  params.name.trim(),
        email: params.email.trim().toLowerCase(),
        password: params.password,
        phone: params.phone?.trim() || undefined,
        deviceId,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Erro ao criar conta.');
    }

    await AuthService.wipeLocalDataBeforeNewSession(data.user as User);
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    await AuthService.restorePostLoginLocalState(data.user as User);
    return data.user as User;
  }

  /** Atualiza usuário em memória persistente (ex.: cache de avatar). */
  static async patchUserInStorage(partial: Partial<User>): Promise<User | null> {
    const u = await AuthService.getUser();
    if (!u) return null;
    const next = { ...u, ...partial };
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(next));
    return next;
  }

  /**
   * Sincroniza perfil com o servidor (PUT /api/me) e persiste o utilizador fundido.
   * Usar após cadastro prestador — passo 1 grava ficheiro no servidor, mas o avatar da sessão no app deve refletir /me.
   */
  static async patchMe(partial: {
    name?: string;
    email?: string;
    avatarUrl?: string | null;
    preferredChatLocale?: string | null;
    addressJson?: User['addressJson'];
    technicianCoverageGeoJson?: User['technicianProfile'] extends infer T
      ? T extends { serviceCoverageGeoJson?: infer C }
        ? C
        : never
      : never;
    /** PUT /api/me — merge no TechnicianProfile (prestador ACTIVE). */
    technicianWorkScheduleJson?: Record<string, unknown> | null;
    technicianServiceLocationIds?: string[] | null;
  }): Promise<User | null> {
    const u = await AuthService.getUser();
    if (!u) return null;
    const body: Record<string, unknown> = {};
    if (partial.name !== undefined) body.name = partial.name;
    if (partial.email !== undefined) body.email = partial.email;
    if (partial.avatarUrl !== undefined) body.avatarUrl = partial.avatarUrl;
    if (partial.preferredChatLocale !== undefined) {
      body.preferredChatLocale =
        partial.preferredChatLocale === '' ? null : partial.preferredChatLocale;
    }
    if (partial.addressJson !== undefined) body.addressJson = partial.addressJson;
    if (partial.technicianCoverageGeoJson !== undefined) {
      body.technicianCoverageGeoJson = partial.technicianCoverageGeoJson;
    }
    if (partial.technicianWorkScheduleJson !== undefined) {
      body.technicianWorkScheduleJson = partial.technicianWorkScheduleJson;
    }
    if (partial.technicianServiceLocationIds !== undefined) {
      body.technicianServiceLocationIds = partial.technicianServiceLocationIds;
    }
    if (Object.keys(body).length === 0) return u;
    const res = await apiFetch('/api/me', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = String(j.error);
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const serverUser = (await res.json()) as User;
    const merged = await mergeServerUserWithLocalAvatar(u, serverUser);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(merged));
    return merged;
  }

  /** Logout — limpa JWT e dados locais */
  static async logout(options?: {
    preserveLocalData?: boolean;
    reason?: 'session_expired' | 'session_invalidated' | 'manual' | string;
  }): Promise<void> {
    const preserveLocalData = options?.preserveLocalData === true;
    const existing = await AuthService.getUser();
    if (preserveLocalData) {
      await AuthService.savePreservedLocalOwner(existing, options?.reason);
      await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
      return;
    }
    if (existing) {
      try {
        await createEmergencyOfflineBackup(existing, options?.reason || 'logout');
      } catch {
        /* ignore */
      }
    }
    if (existing?.id) {
      try {
        await deleteAvatarCache(existing.id);
      } catch {
        /* ignore */
      }
    }
    // Última tentativa de enviar filas (OS/checklist) antes de apagar — import dinâmico evita ciclo auth ↔ syncService.
    if (existing?.email) {
      try {
        const { pushSyncQueue } = await import('./syncService');
        await Promise.race([
          pushSyncQueue(existing.email),
          new Promise<void>((resolve) => setTimeout(resolve, 18_000)),
        ]);
      } catch {
        /* ignore */
      }
    }
    if (existing) {
      try {
        await backupOpsChatAcksForLogout(existing);
      } catch {
        /* ignore */
      }
    }
    await purgeAllBrSparkLocalCaches();
    try {
      const b = existing?.tenant?.branding;
      if (b && b.enabled) {
        await AsyncStorage.setItem(GUEST_LOGIN_BRANDING_KEY, JSON.stringify(b));
      } else {
        await AsyncStorage.removeItem(GUEST_LOGIN_BRANDING_KEY);
      }
    } catch {
      /* ignore */
    }
  }

  /** Recupera usuário salvo localmente */
  static async getUser(): Promise<User | null> {
    try {
      const [userData, token] = await Promise.all([
        AsyncStorage.getItem(USER_KEY),
        AsyncStorage.getItem(TOKEN_KEY),
      ]);
      if (!userData || !token) return null;
      return JSON.parse(userData) as User;
    } catch {
      return null;
    }
  }

  /** Valida sessão no servidor (verifica se JWT ainda é válido) */
  static async validateSession(): Promise<User | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await apiFetch('/api/me');
        if (res.ok) {
          const serverUser = (await res.json()) as User;
          const prev = await AuthService.getUser();

          // Alguns ambientes/endpoints podem devolver `/me` sem `appContext.capabilities` em situações transitórias
          // (ex.: cold-start / cache / rollout). Se apagarmos isso, o app perde `mobile.mode.provider` e
          // força o utilizador para o modo cliente indevidamente.
          const normalizedServer: User = (() => {
            if (!prev || prev.id !== serverUser.id) return serverUser;
            const out: User = { ...serverUser };

            const prevCaps = Array.isArray(prev?.appContext?.capabilities) ? prev.appContext!.capabilities : null;
            const serverCaps = Array.isArray(serverUser?.appContext?.capabilities)
              ? serverUser.appContext!.capabilities
              : null;

            // Só “preserva” quando o servidor NÃO enviou capabilities; se enviou array (mesmo vazio), respeita.
            if (!serverCaps && prevCaps) {
              const scope = serverUser.appContext?.scope ?? prev.appContext?.scope ?? 'default';
              out.appContext = {
                scope,
                contextTenantId:
                  serverUser.appContext?.contextTenantId ?? prev.appContext?.contextTenantId ?? null,
                capabilities: prevCaps,
              };
            }

            // Mesmo princípio para `technicianProfile`: se o servidor omitir, não apagar estado local.
            if (serverUser.technicianProfile == null && prev.technicianProfile != null) {
              out.technicianProfile = prev.technicianProfile;
            }

            return out;
          })();

          const merged = await mergeServerUserWithLocalAvatar(prev, normalizedServer);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(merged));
          return merged;
        }
        // Só invalidar sessão com 401 explícito — 5xx/timeout após reconexão não devem forçar novo login.
        if (res.status === 401) {
          await AuthService.logout({ preserveLocalData: true, reason: 'session_expired' });
          return null;
        }
        console.warn(`[Auth] validateSession tentativa ${attempt + 1}/3 — HTTP ${res.status}`);
      } catch (e) {
        console.warn(`[Auth] validateSession tentativa ${attempt + 1}/3 — rede:`, e);
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    return AuthService.getUser();
  }

  /**
   * Exclusão de conta (LGPD): `DELETE /api/me` no Node ou Laravel.
   * Só limpa armazenamento local após resposta de sucesso do servidor.
   */
  static async deleteAccount(): Promise<void> {
    const existing = await AuthService.getUser();
    const res = await apiFetch('/api/me', { method: 'DELETE' });
    if (!res.ok) {
      let msg = `Não foi possível excluir a conta (${res.status}).`;
      try {
        const data = (await res.json()) as { message?: string; error?: string };
        if (typeof data.message === 'string' && data.message.trim()) msg = data.message.trim();
        else if (typeof data.error === 'string' && data.error.trim()) msg = data.error.trim();
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    if (existing?.id) {
      try {
        await deleteAvatarCache(existing.id);
      } catch {
        /* ignore */
      }
    }
    /** Igual ao logout: SQLite + caches; preserva chave de isolamento (evita re-purge total no arranque). */
    await purgeAllBrSparkLocalCaches();
  }

  /** Alterar senha — POST /api/auth/change-password */
  static async changePassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; message?: string }> {
    const res = await apiFetch('/api/me/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao alterar senha.');
    }

    return { success: true, message: data.message };
  }

  /** Solicita link público de redefinição por e-mail. */
  static async requestPasswordReset(
    email: string,
    tenantSlug?: string | null,
  ): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(`${API_BASE}/api/password-reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: String(email || '').trim().toLowerCase(),
        ...(tenantSlug && String(tenantSlug).trim()
          ? { tenantSlug: String(tenantSlug).trim().toLowerCase() }
          : {}),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Não foi possível iniciar a recuperação de senha.');
    }

    return { success: true, message: data.message };
  }

  /** Sugestão de utilitário para chaves isoladas */
  static getUserKey(subKey: string, email: string) {
    return `@brspark:${email}:${subKey}`;
  }

  // ─── 2FA ──────────────────────────────────────────────────────────────

  /** Verifica OTP e completa login. Salva token e retorna usuário. */
  static async verifyOtp(challengeToken: string, otp: string): Promise<User> {
    const res = await fetch(`${API_BASE}/api/2fa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken, otp }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Código inválido.');
    await AuthService.wipeLocalDataBeforeNewSession(data.user as User);
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    await AuthService.restorePostLoginLocalState(data.user as User);
    return data.user as User;
  }

  /** Solicita ativação do 2FA — envia OTP por e-mail */
  static async requestEnableTwoFactor(): Promise<{ challengeToken: string }> {
    const res = await apiFetch('/api/2fa/enable', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao solicitar ativação.');
    return { challengeToken: data.challengeToken };
  }

  /** Confirma ativação do 2FA com o OTP recebido */
  static async confirmEnableTwoFactor(challengeToken: string, otp: string): Promise<void> {
    const res = await apiFetch('/api/2fa/enable/confirm', {
      method: 'POST',
      body: JSON.stringify({ challengeToken, otp }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Código inválido.');
  }

  /** Envia OTP por e-mail antes de desativar o 2FA (chame antes do modal). */
  static async requestDisableTwoFactor(): Promise<void> {
    const res = await apiFetch('/api/2fa/disable/request', { method: 'POST', body: JSON.stringify({}) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao enviar o código por e-mail.');
  }

  /** Desativa 2FA (requer OTP do e-mail enviado por `requestDisableTwoFactor`) */
  static async disableTwoFactor(otp: string): Promise<void> {
    const res = await apiFetch('/api/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ otp }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao desativar 2FA.');
  }

  /** Retorna se o 2FA está habilitado para o usuário atual */
  static async getTwoFactorStatus(): Promise<boolean> {
    try {
      const res = await apiFetch('/api/2fa/status');
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.enabled;
    } catch {
      return false;
    }
  }
}

const SESSION_INVALIDATED_ALERT = {
  title: 'Sessão encerrada',
  message:
    'Sua sessão não é mais válida (outro dispositivo ou atualização de segurança). Faça login novamente.',
} as const;

const sessionInvalidatedListeners: Array<() => void> = [];

/** AuthProvider deve subscrever para limpar estado React após logout forçado. */
export function subscribeSessionInvalidated(cb: () => void): () => void {
  sessionInvalidatedListeners.push(cb);
  return () => {
    const i = sessionInvalidatedListeners.indexOf(cb);
    if (i >= 0) sessionInvalidatedListeners.splice(i, 1);
  };
}

/** Logout + alerta + notificação aos listeners (push remoto ou 401 SESSION_INVALIDATED). Idempotente. */
export async function applySessionInvalidatedFromServer(): Promise<void> {
  if (!(await getToken())) return;
  await AuthService.logout({ preserveLocalData: true, reason: 'session_invalidated' });
  sessionInvalidatedListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
  Alert.alert(SESSION_INVALIDATED_ALERT.title, SESSION_INVALIDATED_ALERT.message);
}

/** Para fetch manual (ex.: storage): resposta 401 com code SESSION_INVALIDATED. */
export async function handleUnauthorizedMaybeSessionInvalidated(res: Response): Promise<void> {
  if (res.status !== 401) return;
  try {
    const body = await res.clone().json();
    if (body?.code === 'SESSION_INVALIDATED') {
      await applySessionInvalidatedFromServer();
    }
  } catch {
    /* ignore */
  }
}

/** Timeout por defeito em pedidos autenticados (evita ecrã preso em «Conectando…» sem rede). */
const DEFAULT_API_FETCH_TIMEOUT_MS = 18_000;

export type ApiFetchOptions = RequestInit & { timeoutMs?: number };

function createAbortError(): Error {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

function mergeFetchHeaders(
  baseHeaders: Record<string, string>,
  customHeaders: HeadersInit | undefined,
): Headers {
  const out = new Headers(baseHeaders);
  if (!customHeaders) return out;

  if (customHeaders instanceof Headers) {
    customHeaders.forEach((value, key) => out.set(key, value));
    return out;
  }

  if (Array.isArray(customHeaders)) {
    for (const [key, value] of customHeaders) out.set(key, value);
    return out;
  }

  for (const [key, value] of Object.entries(customHeaders)) {
    if (value == null) continue;
    out.set(key, String(value));
  }
  return out;
}

/** Fetch autenticado — adiciona JWT automaticamente e aborta após `timeoutMs` (AbortError sem rede). */
export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { timeoutMs = DEFAULT_API_FETCH_TIMEOUT_MS, signal: userSignal, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let onUserAbort: (() => void) | null = null;

  if (userSignal) {
    if (userSignal.aborted) {
      clearTimeout(timer);
      throw createAbortError();
    }
    onUserAbort = () => controller.abort();
    userSignal.addEventListener('abort', onUserAbort, { once: true });
  }

  try {
    const token = await getToken();
    const isFormData =
      typeof FormData !== 'undefined' && rest.body != null && rest.body instanceof FormData;
    /** Multipart: não definir Content-Type — o runtime define boundary (RN/fetch). */
    const baseHeaders: Record<string, string> = isFormData
      ? { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      : {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
    const res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: mergeFetchHeaders(baseHeaders, rest.headers),
    });
    if (res.status === 401) {
      console.warn(`[apiFetch] ⚠️ 401 em ${path} — token expirado? Faça logout e login novamente.`);
      try {
        const body = await res.clone().json();
        if (body?.code === 'SESSION_INVALIDATED') {
          await applySessionInvalidatedFromServer();
        }
      } catch {
        /* ignore */
      }
    }
    return res;
  } finally {
    if (userSignal && onUserAbort) {
      userSignal.removeEventListener('abort', onUserAbort);
    }
    clearTimeout(timer);
  }
}
