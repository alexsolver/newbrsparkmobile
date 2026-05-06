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
import { Platform, Alert } from 'react-native';
import * as Network from 'expo-network';
import { warnDev } from '../utils/devLog';
import { safeJsonParse } from '../utils/safeJsonParse';
import {
  TOKEN_KEY,
  USER_KEY,
  getToken,
  clearAccessTokenStorage,
  setAccessTokenStorage,
  clearRefreshTokenSecure,
  getRefreshTokenSecure,
  setRefreshTokenSecure,
} from './appSessionTokenStorage';
import { API_BASE } from './appApiBase';

export { getToken, TOKEN_KEY, USER_KEY } from './appSessionTokenStorage';
export { API_BASE };

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
  /** Linha User: tenant de registo; pode diferir de `tenantId` quando há empresa dedicada no JWT. */
  homeTenantId?: string;
  /** Marca da experiência «cliente» (piscina) quando `homeTenantId` ≠ tenant da sessão. */
  clientTenantBranding?: User['tenant'] extends infer T
    ? T extends { branding?: infer B }
      ? B
      : never
    : never;
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
      /** Logo só do ecrã de login; vazio = mesmo que logos globais. */
      loginPageLogoUrl?: string;
      /** Cor sólida do bloco de topo do login; vazio = fundo padrão. */
      loginBackgroundColor?: string;
      /** Fundo da barra global (logo + alertas + avatar). */
      appHeaderBackgroundColor?: string;
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
    /** Janela de rematrícula facial (prestador ACTIVE): até quando pode alterar fotos na app. */
    faceReenrollmentUntil?: string | null;
    faceReenrollmentNote?: string | null;
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
  /** Fotos base FaceMatch (quando há `technicianProfile`); URLs absolutas. */
  faceEnrollmentPhotos?: Array<{ id: string; url: string; mimeType?: string; createdAt?: string }>;
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

/** Janela temporária para o prestador renovar avatar + fotos biométricas na app. */
export function isFaceReenrollmentWindowOpen(user: User | null | undefined): boolean {
  const raw = user?.technicianProfile?.faceReenrollmentUntil;
  if (!raw) return false;
  const t = new Date(String(raw)).getTime();
  return Number.isFinite(t) && t > Date.now();
}

/** Avatar bloqueado no app (prestador ACTIVE sem janela de rematrícula). */
export function isTechnicianAvatarLocked(user: User | null | undefined): boolean {
  return isTechnicianProfileActive(user) && !isFaceReenrollmentWindowOpen(user);
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

/**
 * Remove JWT + utilizador + refresh locais **sem** purge de SQLite/caches nem alertas.
 * Fluxos públicos (ex.: registo OTP): evita que `apiFetch`/`validateSession` enviem Bearer antigo
 * e o backend responda `SESSION_INVALIDATED` enquanto o utilizador cria conta.
 */
export async function clearStoredAppCredentials(): Promise<void> {
  await clearRefreshTokenSecure();
  await clearAccessTokenStorage();
  try {
    await AsyncStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Contador reentrante: registo OTP / navegação para «Criar conta».
 * Respostas tardias com `SESSION_INVALIDATED` para um JWT **antigo** (pedido em voo) não podem
 * apagar a sessão nova nem mostrar o alerta — caso típico ao tocar em «Criar minha conta».
 */
let publicAuthFlowDepth = 0;

export function beginPublicAuthFlow(): void {
  publicAuthFlowDepth += 1;
}

export function endPublicAuthFlow(): void {
  publicAuthFlowDepth = Math.max(0, publicAuthFlowDepth - 1);
}

export function getPublicAuthFlowDepth(): number {
  return publicAuthFlowDepth;
}

/** Ao sair do ecrã de registo: zera o contador (emparelha login `begin` + registo `begin` sem depender de múltiplos `end`). */
export function resetPublicAuthFlow(): void {
  publicAuthFlowDepth = 0;
}

function isPublicAuthFlowActive(): boolean {
  return publicAuthFlowDepth > 0;
}

/** Grava access + utilizador; refresh opcional (ausente = limpar refresh antigo). */
export async function persistAppSessionPayload(data: {
  token: string;
  user: User;
  refreshToken?: string | null;
}): Promise<void> {
  await setAccessTokenStorage(data.token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
  const rt = data.refreshToken != null ? String(data.refreshToken).trim() : '';
  if (rt) await setRefreshTokenSecure(rt);
  else await clearRefreshTokenSecure();
}

let refreshAccessTokenInFlight: Promise<boolean> | null = null;

/** Uma renovação em voo por vez; devolve true se o access token foi atualizado. */
async function refreshAccessTokenOnce(): Promise<boolean> {
  if (refreshAccessTokenInFlight) return refreshAccessTokenInFlight;
  refreshAccessTokenInFlight = (async () => {
    try {
      const rt = await getRefreshTokenSecure();
      if (!rt) return false;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REFRESH_TOKEN_FETCH_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/api/session/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        if (res.status === 401) await clearRefreshTokenSecure();
        return false;
      }
      const data = (await res.json()) as { token?: string; refreshToken?: string };
      if (!data.token || !data.refreshToken) return false;
      await setAccessTokenStorage(data.token);
      await setRefreshTokenSecure(String(data.refreshToken));
      return true;
    } catch (e) {
      warnDev('refreshAccessTokenOnce', e);
      return false;
    } finally {
      refreshAccessTokenInFlight = null;
    }
  })();
  return refreshAccessTokenInFlight;
}
/** Branding efectivo da última sessão — ecrã de login sem JWT ainda mostra logo/cores até novo login. */
export const GUEST_LOGIN_BRANDING_KEY = '@aria:guest_login_branding_v1';
/** Não apagar no purge — evita re-disparar migração nuclear em `_layout` a cada login. */
const ISOLATION_VERSION_KEY = '@aria:isolation_v';
/** Marcador temporário quando a sessão expira/sessão invalidada para reter dados offline até novo login da mesma conta. */
const PRESERVED_LOCAL_OWNER_KEY = '@aria_preserved_local_owner_v1';

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
 * Remove caches Aria em AsyncStorage (OS, rascunhos, filas, dados por e-mail, etc.) e SQLite local.
 * Preserva apenas `ISOLATION_VERSION_KEY` (controle de migração de isolamento no arranque).
 */
export async function purgeAllAriaLocalCaches(): Promise<void> {
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
    if (k.startsWith('@aria')) return true;
    if (k.startsWith('aria_')) return true;
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
  await clearRefreshTokenSecure();
  await clearAccessTokenStorage();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** Evita «JSON Parse error: Unexpected character: <» quando o proxy devolve HTML (404/502). */
async function parseFetchJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  const t = text.trim();
  if (!t) return {};
  if (t.startsWith('<')) {
    throw new Error(
      `O servidor devolveu HTML em vez de JSON (HTTP ${res.status}). Verifique a URL da API ou tente mais tarde.`,
    );
  }
  try {
    return JSON.parse(t);
  } catch {
    throw new Error(`Resposta inválida do servidor (HTTP ${res.status}).`);
  }
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
      const parsed = safeJsonParse<PreservedLocalOwner | null>(raw, null, 'loadPreservedLocalOwner');
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

    await clearRefreshTokenSecure();

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
    await purgeAllAriaLocalCaches();
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
    await persistAppSessionPayload({
      token: data.token,
      user: data.user as User,
      refreshToken: (data as { refreshToken?: string }).refreshToken,
    });
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
    await persistAppSessionPayload({
      token: data.token,
      user: data.user as User,
      refreshToken: (data as { refreshToken?: string }).refreshToken,
    });
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
    const data = (await parseFetchJsonBody(res)) as { workspaces?: SiblingWorkspaceOption[] };
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
    const data = (await parseFetchJsonBody(res)) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || 'Não foi possível mudar de organização.');
    }
    await AuthService.wipeLocalDataBeforeNewSession(data.user as User);
    await persistAppSessionPayload({
      token: String(data.token ?? ''),
      user: data.user as User,
      refreshToken: (data as { refreshToken?: string }).refreshToken,
    });
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
    const data = (await parseFetchJsonBody(res)) as Record<string, unknown>;
    if (!res.ok) {
      const tid = (data as { tenantId?: string }).tenantId;
      if (res.status === 409 && tid) {
        const conflictUserId = (data as { userId?: string }).userId;
        const local = await AuthService.getUser();
        // Espaço prestador/cliente já existe na tenant partilhada para ESTE login: a sessão JWT
        // já é esse utilizador — `switch-workspace` devolveria «Já está nesta organização.».
        if (conflictUserId && local && String(conflictUserId) === String(local.id)) {
          const fresh = await AuthService.validateSession();
          if (fresh) {
            await AuthService.restorePostLoginLocalState(fresh);
            return fresh;
          }
          await AuthService.restorePostLoginLocalState(local);
          return local;
        }
        return AuthService.switchWorkspace(String(tid).trim());
      }
      throw new Error((data as { error?: string }).error || 'Não foi possível criar o espaço.');
    }
    await AuthService.wipeLocalDataBeforeNewSession(data.user as User);
    await persistAppSessionPayload({
      token: String(data.token ?? ''),
      user: data.user as User,
      refreshToken: (data as { refreshToken?: string }).refreshToken,
    });
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
    const d = data as { token: string; user: User; refreshToken?: string };
    await AuthService.wipeLocalDataBeforeNewSession(d.user);
    await persistAppSessionPayload({
      token: d.token,
      user: d.user,
      refreshToken: d.refreshToken,
    });
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
    const controller = new AbortController();
    const regCompleteTimer = setTimeout(() => controller.abort(), 45_000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/otp-auth/register-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupToken: params.setupToken,
          password: params.password,
          consent: params.consent,
          deviceId,
        }),
        signal: controller.signal,
      });
    } catch (e: unknown) {
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name?: string }).name) : '';
      if (name === 'AbortError') {
        throw new Error('Tempo esgotado ao criar conta. Verifique a internet e tente novamente.');
      }
      throw e instanceof Error ? e : new Error('Erro de rede ao criar conta.');
    } finally {
      clearTimeout(regCompleteTimer);
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || (data as { code?: string }).code || 'Erro ao criar conta.');
    }
    const d = data as { token: string; user: User; refreshToken?: string };
    await AuthService.wipeLocalDataBeforeNewSession(d.user);
    await persistAppSessionPayload({
      token: d.token,
      user: d.user,
      refreshToken: d.refreshToken,
    });
    await AuthService.restorePostLoginLocalState(d.user);
    return d.user;
  }

  /** Registro — POST /api/register (utilizador USER na tenant master Aria) */
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
    await persistAppSessionPayload({
      token: data.token,
      user: data.user as User,
      refreshToken: (data as { refreshToken?: string }).refreshToken,
    });
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
      await clearRefreshTokenSecure();
      await clearAccessTokenStorage();
      try {
        await AsyncStorage.removeItem(USER_KEY);
      } catch {
        /* ignore */
      }
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
    await purgeAllAriaLocalCaches();
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
      const [userData, token] = await Promise.all([AsyncStorage.getItem(USER_KEY), getToken()]);
      if (!userData || !token) return null;
      const u = safeJsonParse<User | null>(userData, null, 'AuthService.getUser');
      if (!u || typeof u !== 'object' || !String((u as User).id || '').trim()) return null;
      return u as User;
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

            // Preservar capabilities locais quando o `/me` omite o campo **ou** devolve `[]` (alguns deploys
            // serializam array vazio em vez de omitir — apagava `mobile.workTime.access` / `mobile.mode.provider`).
            if (!serverCaps && prevCaps) {
              const scope = serverUser.appContext?.scope ?? prev.appContext?.scope ?? 'default';
              out.appContext = {
                scope,
                contextTenantId:
                  serverUser.appContext?.contextTenantId ?? prev.appContext?.contextTenantId ?? null,
                capabilities: prevCaps,
              };
            } else if (serverCaps && serverCaps.length === 0 && prevCaps && prevCaps.length > 0) {
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

            const hPrev = String(prev.homeTenantId || '');
            const hSrv = String(serverUser.homeTenantId || '');
            const tSrv = String(serverUser.tenantId || '');
            if (
              serverUser.clientTenantBranding == null &&
              prev.clientTenantBranding != null &&
              hSrv &&
              tSrv &&
              hSrv === hPrev &&
              hSrv !== tSrv
            ) {
              out.clientTenantBranding = prev.clientTenantBranding;
            }

            return out;
          })();

          const merged = await mergeServerUserWithLocalAvatar(prev, normalizedServer);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(merged));
          return merged;
        }
        // 401: `apiFetch` já tentou refresh. Não apagar JWT/utilizador aqui — prestadores podem passar dias
        // sem rede; expirar access/refresh não deve deslogar nem apagar a sessão local (offline-first).
        // `SESSION_INVALIDATED` é tratado em `apiFetch` e limpa armazenamento antes de devolver o 401.
        if (res.status === 401) {
          const still = await AuthService.getUser();
          if (!still) return null;
          console.warn(
            '[Auth] validateSession: 401 com credenciais locais — a manter sessão para trabalho offline; sincronizar após rede.',
          );
          return still;
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
    await purgeAllAriaLocalCaches();
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
    return `@aria:${email}:${subKey}`;
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
    await persistAppSessionPayload({
      token: data.token,
      user: data.user as User,
      refreshToken: (data as { refreshToken?: string }).refreshToken,
    });
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

/**
 * Logout + alerta + notificação aos listeners (401 SESSION_INVALIDATED ou push FORCE_LOGOUT).
 * Idempotente. Com `force: true` (ex.: push administrativo) aplica sempre.
 * Sem rede: não apaga sessão — o app é offline-first; a revalidação ocorre no próximo pedido com internet.
 */
export async function applySessionInvalidatedFromServer(options?: { force?: boolean }): Promise<void> {
  if (!options?.force) {
    try {
      const net = await Network.getNetworkStateAsync();
      if (net.isConnected !== true) {
        console.warn(
          '[Auth] SESSION_INVALIDATED sem rede — sessão local mantida (offline-first). Revalidação ao voltar online.',
        );
        return;
      }
    } catch {
      console.warn(
        '[Auth] SESSION_INVALIDATED: rede indeterminada — sessão local mantida (offline-first).',
      );
      return;
    }
  }
  const hasAccess = !!(await getToken());
  const hasRefresh = !!(await getRefreshTokenSecure());
  if (!hasAccess && !hasRefresh) return;
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
  if (isPublicAuthFlowActive()) return;
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

/** O refresh usa `fetch` directo (sem `apiFetch`); sem abort o arranque pode ficar preso para sempre em rede avariada. */
const REFRESH_TOKEN_FETCH_TIMEOUT_MS = 18_000;

export type ApiFetchOptions = RequestInit & { timeoutMs?: number; skipTokenRefresh?: boolean };

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
  const {
    timeoutMs = DEFAULT_API_FETCH_TIMEOUT_MS,
    skipTokenRefresh,
    signal: userSignal,
    ...rest
  } = options;
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
      let sessionInvalidated = false;
      try {
        const body = await res.clone().json();
        if (body?.code === 'SESSION_INVALIDATED') sessionInvalidated = true;
      } catch {
        /* ignore */
      }
      if (sessionInvalidated) {
        if (isPublicAuthFlowActive()) {
          console.warn(
            '[apiFetch] SESSION_INVALIDATED ignorado em fluxo público (registo / credenciais antigas em voo):',
            path,
          );
          return res;
        }
        await applySessionInvalidatedFromServer();
        return res;
      }
      if (!skipTokenRefresh && path !== '/api/session/refresh') {
        const refreshed = await refreshAccessTokenOnce();
        if (refreshed) {
          return apiFetch(path, { ...options, skipTokenRefresh: true });
        }
      }
      console.warn(`[apiFetch] ⚠️ 401 em ${path} — token expirado? Faça logout e login novamente.`);
    }
    return res;
  } finally {
    if (userSignal && onUserAbort) {
      userSignal.removeEventListener('abort', onUserAbort);
    }
    clearTimeout(timer);
  }
}
