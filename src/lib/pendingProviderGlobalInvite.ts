import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../services/auth';
import { PENDING_PROVIDER_GLOBAL_INVITE_JWT_KEY } from './onboardingPrefs';

/**
 * Liga o JWT de convite global (painel) à conta autenticada.
 * @returns `none` — sem token pendente; `ok` — associado; `error` — falhou (mensagem opcional).
 */
export async function tryConsumePendingProviderGlobalInvite(): Promise<{
  outcome: 'none' | 'ok' | 'error';
  message?: string;
}> {
  let jwt: string | null = null;
  try {
    const j = await AsyncStorage.getItem(PENDING_PROVIDER_GLOBAL_INVITE_JWT_KEY);
    jwt = String(j || '').trim() || null;
  } catch {
    jwt = null;
  }
  if (!jwt) return { outcome: 'none' };
  try {
    const res = await apiFetch('/api/providers/me/onboarding/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteToken: jwt }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string; message?: string };
    if (!res.ok) {
      const code = String(data?.code || '').trim();
      const msg = String(data?.error || data?.message || '').trim() || `HTTP ${res.status}`;
      if (code === 'INVITE_EMAIL_MISMATCH') {
        return { outcome: 'error', message: msg };
      }
      await AsyncStorage.removeItem(PENDING_PROVIDER_GLOBAL_INVITE_JWT_KEY).catch(() => {});
      return { outcome: 'error', message: msg };
    }
    await AsyncStorage.removeItem(PENDING_PROVIDER_GLOBAL_INVITE_JWT_KEY).catch(() => {});
    return { outcome: 'ok' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { outcome: 'error', message: msg || 'Network error' };
  }
}
