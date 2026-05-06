import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { CHAT_UNREAD_CHANGED_EVENT } from './chatUnreadEvents';
import { loadRoomListCache } from '../services/chatOfflineStorage';

/** Deve coincidir com o prefixo usado em `getOpsChatAckStorageKey`. */
const OPS_CHAT_ACK_KEY_PREFIX = '@aria_ops_chat_ack_';

/**
 * Chave fora do prefixo `@aria` / `aria_` para sobreviver ao `purgeAllAriaLocalCaches`
 * e repor leituras após logout+login da mesma conta.
 */
export const OPS_CHAT_ACK_LOGOUT_BACKUP_KEY = 'ARIA_OPS_CHAT_ACK_LOGOUT_BACKUP_V1';

export function getOpsChatAckStorageKey(executionId: string): string {
  return `${OPS_CHAT_ACK_KEY_PREFIX}${String(executionId || '').trim()}`;
}

/** Só `id|email` — evita falhas quando `tenantId` vem vazio no JWT antigo vs `/login`. */
function sessionFingerprint(u: { id?: string; email?: string }): string {
  const id = String(u?.id ?? '').trim().toLowerCase();
  const email = String(u?.email ?? '').trim().toLowerCase();
  return `${id}|${email}`;
}

function fingerprintMatches(storedFp: string, user: { id?: string; email?: string }): boolean {
  const cur = sessionFingerprint(user);
  if (String(storedFp).trim() === cur) return true;
  const parts = String(storedFp || '').split('|').filter(Boolean);
  const id = String(user?.id ?? '').trim().toLowerCase();
  const email = String(user?.email ?? '').trim().toLowerCase();
  return parts.length >= 2 && parts[0] === id && parts[1] === email;
}

/** Após restauro, o `cuid` do utilizador pode mudar; o e-mail continua a ser a âncora segura. */
function fingerprintMatchesForRestore(storedFp: string, user: { id?: string; email?: string }): boolean {
  if (fingerprintMatches(storedFp, user)) return true;
  const em = String(user?.email ?? '').trim().toLowerCase();
  if (!em) return false;
  const parts = String(storedFp || '').split('|').filter(Boolean);
  if (parts.length >= 2 && String(parts[1] || '').trim().toLowerCase() === em) return true;
  return false;
}

type BackupPayloadV1 = {
  v: 1;
  fingerprint: string;
  acks: Record<string, string>;
};

type CorpReadMarker = { roomId: string; lastMessageAt: number | null };

type BackupPayloadV2 = {
  v: 2;
  fingerprint: string;
  opsAcks: Record<string, string>;
  corpReadMarkers: CorpReadMarker[];
};

function normLastMessageAt(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** ms — cache vs API podem diferir 1s; relógio / JSON. Antes isto anulava o re-PUT e o badge voltava. */
const LAST_MESSAGE_AT_TOLERANCE_MS = 8_000;

function sameLastMessageAt(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= LAST_MESSAGE_AT_TOLERANCE_MS;
}

/**
 * Antes do purge no logout: grava acks do chat operacional + salas corporativas «sem não lidos»
 * no cache (para reenviar `markAsRead` só se não entraram mensagens novas).
 */
export async function backupOpsChatAcksForLogout(
  user: { id?: string; email?: string; tenantId?: string; tenant?: { id?: string } },
): Promise<void> {
  try {
    const all = await AsyncStorage.getAllKeys();
    const opsAcks: Record<string, string> = {};
    for (const k of all) {
      if (!k || !k.startsWith(OPS_CHAT_ACK_KEY_PREFIX)) continue;
      const exId = k.slice(OPS_CHAT_ACK_KEY_PREFIX.length);
      if (!exId) continue;
      const v = await AsyncStorage.getItem(k);
      if (v != null && String(v).trim() !== '') opsAcks[exId] = String(v);
    }

    let corpReadMarkers: CorpReadMarker[] = [];
    try {
      const uid = String(user?.id ?? '').trim();
      if (uid) {
        const rooms = await loadRoomListCache(uid);
        corpReadMarkers = rooms
          .filter((r) => (r.unreadCount ?? 0) === 0 && String(r.id || '').trim())
          .map((r) => ({
            roomId: String(r.id).trim(),
            lastMessageAt: normLastMessageAt(r.lastMessageAt),
          }));
      }
    } catch {
      /* ignore */
    }

    if (Object.keys(opsAcks).length === 0 && corpReadMarkers.length === 0) {
      await AsyncStorage.removeItem(OPS_CHAT_ACK_LOGOUT_BACKUP_KEY).catch(() => {});
      return;
    }

    const payload: BackupPayloadV2 = {
      v: 2,
      fingerprint: sessionFingerprint(user),
      opsAcks,
      corpReadMarkers,
    };
    await AsyncStorage.setItem(OPS_CHAT_ACK_LOGOUT_BACKUP_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/**
 * Após login com sessão gravada: repõe acks operacionais e, se o servidor ainda mostra a mesma
 * última mensagem que no logout, reenvia `markAsRead` nas salas corporativas.
 */
export async function restoreOpsChatAcksAfterLogin(
  user: { id?: string; email?: string; tenantId?: string; tenant?: { id?: string } },
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(OPS_CHAT_ACK_LOGOUT_BACKUP_KEY);
    if (!raw) return;

    let opsAcks: Record<string, string> = {};
    let corpReadMarkers: CorpReadMarker[] = [];
    let storedFp = '';

    try {
      const parsed = JSON.parse(raw) as BackupPayloadV1 | BackupPayloadV2;
      if (!parsed || typeof parsed !== 'object') {
        await AsyncStorage.removeItem(OPS_CHAT_ACK_LOGOUT_BACKUP_KEY).catch(() => {});
        return;
      }
      storedFp = String((parsed as { fingerprint?: string }).fingerprint || '');
      if (!storedFp || !fingerprintMatchesForRestore(storedFp, user)) {
        await AsyncStorage.removeItem(OPS_CHAT_ACK_LOGOUT_BACKUP_KEY).catch(() => {});
        return;
      }

      if ((parsed as BackupPayloadV1).v === 1 && (parsed as BackupPayloadV1).acks) {
        opsAcks = (parsed as BackupPayloadV1).acks;
      } else if ((parsed as BackupPayloadV2).v === 2) {
        const p = parsed as BackupPayloadV2;
        opsAcks = p.opsAcks && typeof p.opsAcks === 'object' ? p.opsAcks : {};
        corpReadMarkers = Array.isArray(p.corpReadMarkers) ? p.corpReadMarkers : [];
      } else {
        await AsyncStorage.removeItem(OPS_CHAT_ACK_LOGOUT_BACKUP_KEY).catch(() => {});
        return;
      }
    } catch {
      await AsyncStorage.removeItem(OPS_CHAT_ACK_LOGOUT_BACKUP_KEY).catch(() => {});
      return;
    }

    await Promise.all(
      Object.entries(opsAcks).map(([exId, ms]) => AsyncStorage.setItem(getOpsChatAckStorageKey(exId), ms)),
    );

    if (corpReadMarkers.length > 0) {
      const { ChatService } = await import('../services/chat');
      const rooms = await ChatService.getRooms();
      const byId = new Map(rooms.map((r) => [String(r.id), r]));
      for (const m of corpReadMarkers) {
        const rid = String(m.roomId || '').trim();
        if (!rid) continue;
        const cur = byId.get(rid);
        if (!cur) continue;
        const curTs = normLastMessageAt(cur.lastMessageAt);
        const prevTs = m.lastMessageAt ?? null;
        if (sameLastMessageAt(prevTs, curTs)) {
          await ChatService.markAsRead(rid).catch(() => {});
        }
      }
    }

    await AsyncStorage.removeItem(OPS_CHAT_ACK_LOGOUT_BACKUP_KEY).catch(() => {});
    DeviceEventEmitter.emit(CHAT_UNREAD_CHANGED_EVENT);
  } catch {
    /* ignore */
  }
}
