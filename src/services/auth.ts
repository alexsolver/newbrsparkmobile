import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearLocalDatabase } from '../database';
import { deleteAvatarCache, mergeServerUserWithLocalAvatar } from './avatarLocalCache';

// ─── Config ──────────────────────────────────────────────────────────────────
// Altere MAC_IP para o IP da sua máquina na rede Wi-Fi local quando testar no celular.
// Em simulador use 'localhost'. Em Expo Go no device, use seu IP da rede (ex: 192.168.1.10).
const MAC_IP = '192.168.15.73';          // ← altere para seu IP se necessário
/** Porta da API (admin-panel/backend + PostgreSQL). */
const DEV_API_PORT = process.env.EXPO_PUBLIC_API_PORT || '3001';
export const API_BASE = __DEV__
  ? `http://${MAC_IP}:${DEV_API_PORT}`
  : 'https://api.brspark.com';           // produção (ajuste quando deployar)

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

// ─── Helpers ─────────────────────────────────────────────────────────────────
export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
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
  // Log token expiry issues clearly
  if (res.status === 401) {
    console.warn(`[apiFetch] ⚠️ 401 em ${path} — token expirado? Faça logout e login novamente.`);
  }
  return res;
}

// ─── AuthService ─────────────────────────────────────────────────────────────
export class AuthService {

  /** Login — POST /api/login */
  static async login(email: string, password: string): Promise<User> {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Erro ao fazer login.');
    }

    // Fluxo 2FA: backend pede confirmação via OTP
    if (data.requiresTwoFactor && data.challengeToken) {
      throw new TwoFactorRequired(data.challengeToken);
    }

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

    const res = await fetch(`${API_BASE}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:  params.name.trim(),
        email: params.email.trim().toLowerCase(),
        password: params.password,
        phone: params.phone?.trim() || undefined,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Erro ao criar conta.');
    }

    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user as User;
  }

  /** Atualiza utilizador em memória persistente (ex.: cache de avatar). */
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
    const keys = [
      TOKEN_KEY, 
      USER_KEY, 
      '@user_profile', 
      '@pref_push_enabled',
      'brspark_costs_expenses',
      'brspark_costs_budgets',
      'brspark_costs_recurring',
      'brspark_last_manual_sync',
      '@brspark_cloud_tasks',
      '@brspark_outbox',
      '@brspark_telemetry_outbox',
      '@brspark_active_role',
      '@brspark_read_notifications'
    ];
    await AsyncStorage.multiRemove(keys);
    clearLocalDatabase();
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
    try {
      const res = await apiFetch('/api/me');
      if (!res.ok) {
        await AuthService.logout();
        return null;
      }
      const serverUser = (await res.json()) as User;
      const prev = await AuthService.getUser();
      const merged = await mergeServerUserWithLocalAvatar(prev, serverUser);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(merged));
      return merged;
    } catch {
      // Sem internet — retorna o usuário local (modo offline)
      return AuthService.getUser();
    }
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
