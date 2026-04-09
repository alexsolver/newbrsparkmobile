import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearLocalDatabase } from '../database';
import { deleteAvatarCache, mergeServerUserWithLocalAvatar } from './avatarLocalCache';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
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
// Altere MAC_IP para o IP da sua máquina na rede Wi‑Fi local quando testar no celular.
// Em simulador use 'localhost'. Em Expo Go no device, use seu IP da rede (ex: 192.168.1.10).
const MAC_IP = '192.168.15.73';          // ← altere para seu IP se necessário
/** Porta da API (admin-panel/backend + PostgreSQL). */
const DEV_API_PORT = process.env.EXPO_PUBLIC_API_PORT || '3001';

/** Origem da API em release: só esquema+host (+porta se preciso). Sem `/api` no fim (o app acrescenta `/api/...`). */
function normalizeProductionApiBase(raw: string | undefined): string | undefined {
  if (raw == null || typeof raw !== 'string') return undefined;
  let u = raw.trim().replace(/\/+$/, '');
  if (u.toLowerCase().endsWith('/api')) {
    u = u.slice(0, -4).replace(/\/+$/, '');
  }
  return u.length > 0 ? u : undefined;
}

const PRODUCTION_API_DEFAULT = 'https://brsparks.wstrategy.com.br';

/**
 * Base da API (origem sem `/api` no fim).
 * - Se `EXPO_PUBLIC_API_BASE` estiver definido (.env / EAS), usa-se **sempre** (também em `__DEV__`),
 *   para testar no celular com Expo contra produção sem depender do IP local :3001.
 * - Sem variável: em dev → `http://MAC_IP:porta`; em release → produção.
 */
const RESOLVED_API_BASE =
  normalizeProductionApiBase(process.env.EXPO_PUBLIC_API_BASE) ||
  (__DEV__ ? `http://${MAC_IP}:${DEV_API_PORT}` : PRODUCTION_API_DEFAULT);

export const API_BASE = RESOLVED_API_BASE;

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  role: string;
  avatarUrl?: string;
  /** file:// após cache local (offline) */
  avatarLocalUri?: string;
  tenant?: {
    id: string;
    name: string;
    status: string;
  };
  technicianProfile?: {
    id: string;
    status: string;
    score: number;
    cft?: string;
    specialty?: string;
  };
}

/** Prestador habilitado a receber OS (backend exige `TechnicianProfile.status === ACTIVE`). */
export function isTechnicianProfileActive(user: User | null | undefined): boolean {
  return String(user?.technicianProfile?.status || '').toUpperCase() === 'ACTIVE';
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

const TOKEN_KEY = 'brspark_jwt';
const USER_KEY  = 'brspark_user';
/** Não apagar no purge — evita re-disparar migração nuclear em `_layout` a cada login. */
const ISOLATION_VERSION_KEY = '@brspark:isolation_v';

/**
 * Remove caches BrSpark em AsyncStorage (OS, rascunhos, filas, dados por e-mail, etc.) e SQLite local.
 * Preserva apenas `ISOLATION_VERSION_KEY` (controlo de migração de isolamento no arranque).
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

  /** Avatar do usuário anterior + purge total antes de gravar nova sessão (mesmo aparelho, outra conta). */
  static async wipeLocalDataBeforeNewSession(): Promise<void> {
    const existing = await AuthService.getUser();
    if (existing?.id) {
      try {
        await deleteAvatarCache(existing.id);
      } catch {
        /* ignore */
      }
    }
    await purgeAllBrSparkLocalCaches();
  }

  /** Login — POST /api/login */
  static async login(email: string, password: string): Promise<User> {
    const deviceId = await getDeviceId();
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password, deviceId }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Erro ao fazer login.');
    }

    // Fluxo 2FA: backend pede confirmação via OTP
    if (data.requiresTwoFactor && data.challengeToken) {
      throw new TwoFactorRequired(data.challengeToken);
    }

    await AuthService.wipeLocalDataBeforeNewSession();
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user as User;
  }

  /** Registro — POST /api/register (cria Tenant + User automaticamente) */
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

    await AuthService.wipeLocalDataBeforeNewSession();
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
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

  /** Logout — limpa JWT e dados locais */
  static async logout(): Promise<void> {
    const existing = await AuthService.getUser();
    if (existing?.id) {
      try {
        await deleteAvatarCache(existing.id);
      } catch {
        /* ignore */
      }
    }
    await purgeAllBrSparkLocalCaches();
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
          const merged = await mergeServerUserWithLocalAvatar(prev, serverUser);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(merged));
          return merged;
        }
        // Só invalidar sessão com 401 explícito — 5xx/timeout após reconexão não devem forçar novo login.
        if (res.status === 401) {
          await AuthService.logout();
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

  /** Exclusão de conta (LGPD) */
  static async deleteAccount(): Promise<void> {
    const existing = await AuthService.getUser();
    try {
      await apiFetch('/api/me', { method: 'DELETE' });
    } finally {
      if (existing?.id) {
        try {
          await deleteAvatarCache(existing.id);
        } catch {
          /* ignore */
        }
      }
      await AsyncStorage.clear();
    }
  }

  /** Alterar senha — POST /api/auth/change-password */
  static async changePassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; message?: string }> {
    const res = await apiFetch('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao alterar senha.');
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
    await AuthService.wipeLocalDataBeforeNewSession();
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
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

  /** Desativa 2FA (requer OTP válido) */
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
  await AuthService.logout();
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

/** Fetch autenticado — adiciona JWT automaticamente */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
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
}
