import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { CHAT_UNREAD_CHANGED_EVENT } from './chatUnreadEvents';

/** Deve coincidir com o prefixo usado em `getOpsChatAckStorageKey`. */
const OPS_CHAT_ACK_KEY_PREFIX = '@brspark_ops_chat_ack_';

/**
 * Chave fora do prefixo `@brspark` / `brspark_` para sobreviver ao `purgeAllBrSparkLocalCaches`
 * e repor leituras do chat operacional após logout+login da mesma conta.
 */
export const OPS_CHAT_ACK_LOGOUT_BACKUP_KEY = 'BRSPARK_OPS_CHAT_ACK_LOGOUT_BACKUP_V1';

export function getOpsChatAckStorageKey(executionId: string): string {
  return `${OPS_CHAT_ACK_KEY_PREFIX}${String(executionId || '').trim()}`;
}

function sessionFingerprint(u: { id?: string; email?: string; tenantId?: string }): string {
  const id = String(u?.id ?? '').trim().toLowerCase();
  const email = String(u?.email ?? '').trim().toLowerCase();
  const tenantId = String(u?.tenantId ?? '').trim().toLowerCase();
  return `${id}|${email}|${tenantId}`;
}

type OpsAckBackupPayload = {
  v: 1;
  fingerprint: string;
  acks: Record<string, string>;
};

/**
 * Antes do purge no logout: grava um bundle com os acks de leitura do chat operacional,
 * associado à identidade do utilizador (evita repor dados de outra conta no mesmo aparelho).
 */
export async function backupOpsChatAcksForLogout(user: { id?: string; email?: string; tenantId?: string }): Promise<void> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const acks: Record<string, string> = {};
    for (const k of all) {
      if (!k || !k.startsWith(OPS_CHAT_ACK_KEY_PREFIX)) continue;
      const exId = k.slice(OPS_CHAT_ACK_KEY_PREFIX.length);
      if (!exId) continue;
      const v = await AsyncStorage.getItem(k);
      if (v != null && String(v).trim() !== '') acks[exId] = String(v);
    }
    if (Object.keys(acks).length === 0) {
      await AsyncStorage.removeItem(OPS_CHAT_ACK_LOGOUT_BACKUP_KEY).catch(() => {});
      return;
    }
    const payload: OpsAckBackupPayload = {
      v: 1,
      fingerprint: sessionFingerprint(user),
      acks,
    };
    await AsyncStorage.setItem(OPS_CHAT_ACK_LOGOUT_BACKUP_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/**
 * Após login com sessão gravada: repõe acks se o bundle for da mesma conta; caso contrário remove-o.
 */
export async function restoreOpsChatAcksAfterLogin(user: { id?: string; email?: string; tenantId?: string }): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(OPS_CHAT_ACK_LOGOUT_BACKUP_KEY);
    if (!raw) return;
    let parsed: OpsAckBackupPayload | null = null;
    try {
      parsed = JSON.parse(raw) as OpsAckBackupPayload;
    } catch {
      await AsyncStorage.removeItem(OPS_CHAT_ACK_LOGOUT_BACKUP_KEY).catch(() => {});
      return;
    }
    if (!parsed || parsed.v !== 1 || !parsed.fingerprint || !parsed.acks || typeof parsed.acks !== 'object') {
      await AsyncStorage.removeItem(OPS_CHAT_ACK_LOGOUT_BACKUP_KEY).catch(() => {});
      return;
    }
    const fp = sessionFingerprint(user);
    if (parsed.fingerprint !== fp) {
      await AsyncStorage.removeItem(OPS_CHAT_ACK_LOGOUT_BACKUP_KEY).catch(() => {});
      return;
    }
    await Promise.all(
      Object.entries(parsed.acks).map(([exId, ms]) => AsyncStorage.setItem(getOpsChatAckStorageKey(exId), ms)),
    );
    await AsyncStorage.removeItem(OPS_CHAT_ACK_LOGOUT_BACKUP_KEY).catch(() => {});
    DeviceEventEmitter.emit(CHAT_UNREAD_CHANGED_EVENT);
  } catch {
    /* ignore */
  }
}
