import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';
import { Buffer } from 'buffer';
import { getSyncQueue, queueOfflineAction } from '../database';
import type { User } from './auth';
import { OPERATIONAL_TRANSIT_LOCK_STORAGE_KEY } from './operationalTransitLock';

const RECOVERY_DIR_NAME = 'brspark-offline-recovery';
const RECOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECOVERY_VERSION = 1;
const RECOVERY_KEY_SECURESTORE_KEY = 'brspark_offline_recovery_aes256gcm_key_v1';
const RECOVERY_ENC_VERSION = 1;

const EXACT_KEYS = new Set<string>([
  '@brspark_outbox',
  '@brspark_execution_status_outbox',
  '@brspark_tracking_sync_queue',
  '@brspark_work_time_punch_outbox',
  '@brspark_cloud_tasks',
  '@brspark_rt_cloud_tasks',
  '@brspark_inprogress_tasks',
  '@brspark_accepted_tasks',
  '@brspark_rejected_tasks',
  '@brspark_executed_tasks',
  '@brspark_templates',
  '@brspark_rt_assignments_cache_v1',
  OPERATIONAL_TRANSIT_LOCK_STORAGE_KEY,
]);

const PREFIX_KEYS = ['@draft_tsk_', '@brspark_execution_'];

const ARRAY_MERGE_KEYS = new Set<string>([
  '@brspark_outbox',
  '@brspark_execution_status_outbox',
  '@brspark_tracking_sync_queue',
  '@brspark_work_time_punch_outbox',
  '@brspark_cloud_tasks',
  '@brspark_rt_cloud_tasks',
  '@brspark_inprogress_tasks',
  '@brspark_accepted_tasks',
  '@brspark_rejected_tasks',
  '@brspark_executed_tasks',
  '@brspark_templates',
  '@brspark_rt_assignments_cache_v1',
]);

type RecoverySyncQueueRow = {
  action: string;
  payload: unknown;
  ownerEmail: string | null;
  createdAt: string | null;
};

type RecoverySnapshot = {
  version: number;
  createdAt: number;
  reason?: string;
  identity: {
    id: string;
    email: string;
    tenantId: string;
    fingerprint: string;
  };
  asyncStorage: Record<string, string>;
  syncQueue: RecoverySyncQueueRow[];
};

type RecoveryEncryptedEnvelope = {
  encryption: 'A256GCM';
  encVersion: number;
  ivB64: string;
  ciphertextB64: string;
};

function normalize(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

function userFingerprint(user: Pick<User, 'id' | 'email' | 'tenantId'>): string {
  return `${normalize(user.id)}|${normalize(user.email)}|${normalize(user.tenantId)}`;
}

function userSlug(user: Pick<User, 'id' | 'email' | 'tenantId'>): string {
  const raw = `${normalize(user.id)}__${normalize(user.tenantId)}__${normalize(user.email)}`;
  const slug = raw.replace(/[^a-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || 'unknown';
}

function recoveryBaseDir(): string | null {
  const base = FileSystem.documentDirectory;
  if (!base) return null;
  return `${base}${RECOVERY_DIR_NAME}/`;
}

function recoveryFilePath(user: Pick<User, 'id' | 'email' | 'tenantId'>): string | null {
  const dir = recoveryBaseDir();
  if (!dir) return null;
  return `${dir}${userSlug(user)}.json`;
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(String(b64 || ''), 'base64'));
}

function isEncryptedEnvelope(x: unknown): x is RecoveryEncryptedEnvelope {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const o = x as Partial<RecoveryEncryptedEnvelope>;
  return (
    o.encryption === 'A256GCM' &&
    Number.isFinite(Number(o.encVersion)) &&
    typeof o.ivB64 === 'string' &&
    typeof o.ciphertextB64 === 'string'
  );
}

async function getOrCreateRecoveryEncryptionKey(): Promise<Uint8Array | null> {
  try {
    const existing = await SecureStore.getItemAsync(RECOVERY_KEY_SECURESTORE_KEY);
    if (existing) {
      const parsed = base64ToBytes(existing);
      if (parsed.length === 32) return parsed;
    }
    const key = await Crypto.getRandomBytesAsync(32);
    await SecureStore.setItemAsync(RECOVERY_KEY_SECURESTORE_KEY, bytesToBase64(key));
    return key;
  } catch {
    return null;
  }
}

async function loadRecoveryEncryptionKey(): Promise<Uint8Array | null> {
  try {
    const existing = await SecureStore.getItemAsync(RECOVERY_KEY_SECURESTORE_KEY);
    if (!existing) return null;
    const parsed = base64ToBytes(existing);
    if (parsed.length !== 32) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function encryptRecoverySnapshot(snapshot: RecoverySnapshot): Promise<string | null> {
  const key = await getOrCreateRecoveryEncryptionKey();
  if (!key) return null;
  const iv = await Crypto.getRandomBytesAsync(12);
  const plainBytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const cipherBytes = gcm(key, iv).encrypt(plainBytes);
  const env: RecoveryEncryptedEnvelope = {
    encryption: 'A256GCM',
    encVersion: RECOVERY_ENC_VERSION,
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(cipherBytes),
  };
  return JSON.stringify(env);
}

async function decodeRecoverySnapshotFromFile(raw: string): Promise<RecoverySnapshot | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // Backward compatibility: legacy plaintext snapshot.
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    Number((parsed as RecoverySnapshot).version) === RECOVERY_VERSION
  ) {
    return parsed as RecoverySnapshot;
  }

  if (!isEncryptedEnvelope(parsed)) return null;
  if (Number(parsed.encVersion) !== RECOVERY_ENC_VERSION) return null;

  const key = await loadRecoveryEncryptionKey();
  if (!key) return null;

  try {
    const iv = base64ToBytes(parsed.ivB64);
    const cipherBytes = base64ToBytes(parsed.ciphertextB64);
    const plainBytes = gcm(key, iv).decrypt(cipherBytes);
    const plain = new TextDecoder().decode(plainBytes);
    const snapshot = JSON.parse(plain) as RecoverySnapshot;
    if (!snapshot || typeof snapshot !== 'object') return null;
    if (Number(snapshot.version) !== RECOVERY_VERSION) return null;
    return snapshot;
  } catch {
    return null;
  }
}

async function ensureRecoveryDir(): Promise<string | null> {
  const dir = recoveryBaseDir();
  if (!dir) return null;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    return dir;
  } catch {
    return null;
  }
}

function shouldCaptureKey(k: string): boolean {
  if (EXACT_KEYS.has(k)) return true;
  return PREFIX_KEYS.some((p) => k.startsWith(p));
}

function checklistOutboxIdentityKey(item: any): string {
  const sub = String(item?.metadata?.submissionId || item?.submissionId || '').trim();
  if (sub) return `sub:${sub}`;
  const task = String(item?.taskId || item?.executionId || item?.metadata?.executionId || '').trim();
  if (task) return `task:${task}`;
  return `fallback:${JSON.stringify(item ?? {})}`;
}

function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeUniqueArrayForKey(key: string, currentRaw: string | null, incomingRaw: string): string {
  const current = parseJsonArray(currentRaw);
  const incoming = parseJsonArray(incomingRaw);
  if (current.length === 0) return incomingRaw;
  if (incoming.length === 0) return JSON.stringify(current);

  if (key === '@brspark_outbox') {
    const map = new Map<string, unknown>();
    for (const item of current) map.set(checklistOutboxIdentityKey(item), item);
    for (const item of incoming) map.set(checklistOutboxIdentityKey(item), item);
    return JSON.stringify([...map.values()]);
  }

  const map = new Map<string, unknown>();
  for (const item of current) map.set(JSON.stringify(item), item);
  for (const item of incoming) map.set(JSON.stringify(item), item);
  return JSON.stringify([...map.values()]);
}

async function cleanupExpiredBackups(): Promise<void> {
  const dir = recoveryBaseDir();
  if (!dir) return;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) return;
    const files = await FileSystem.readDirectoryAsync(dir);
    const now = Date.now();
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const p = `${dir}${f}`;
      try {
        const fileInfo = await FileSystem.getInfoAsync(p);
        const mtimeSeconds =
          fileInfo.exists && 'modificationTime' in fileInfo
            ? Number((fileInfo as { modificationTime?: number }).modificationTime || 0)
            : 0;
        const mtimeMs = mtimeSeconds * 1000;
        if (!mtimeMs || now - mtimeMs > RECOVERY_TTL_MS) {
          await FileSystem.deleteAsync(p, { idempotent: true });
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

export async function createEmergencyOfflineBackup(
  user: User | null,
  reason?: string,
): Promise<{ path: string; keyCount: number; queueCount: number } | null> {
  if (!user?.id || !user?.email || !user?.tenantId) return null;
  const dir = await ensureRecoveryDir();
  if (!dir) return null;
  await cleanupExpiredBackups();

  const keys = await AsyncStorage.getAllKeys();
  const selectedKeys = keys.filter(shouldCaptureKey);

  const pairs = selectedKeys.length > 0 ? await AsyncStorage.multiGet(selectedKeys) : [];
  const asyncStorage: Record<string, string> = {};
  for (const [k, v] of pairs) {
    if (!k || v == null) continue;
    asyncStorage[k] = v;
  }

  const queueRowsRaw = getSyncQueue(user.email) as Array<Record<string, unknown>>;
  const syncQueue: RecoverySyncQueueRow[] = queueRowsRaw.map((row) => {
    const payloadRaw = row?.payload;
    let payload: unknown = payloadRaw;
    if (typeof payloadRaw === 'string') {
      try {
        payload = JSON.parse(payloadRaw);
      } catch {
        payload = payloadRaw;
      }
    }
    return {
      action: String(row?.action || ''),
      payload,
      ownerEmail: row?.owner_email == null ? null : String(row.owner_email),
      createdAt: row?.created_at == null ? null : String(row.created_at),
    };
  });

  if (Object.keys(asyncStorage).length === 0 && syncQueue.length === 0) {
    return null;
  }

  const snapshot: RecoverySnapshot = {
    version: RECOVERY_VERSION,
    createdAt: Date.now(),
    reason: reason ? String(reason) : undefined,
    identity: {
      id: String(user.id),
      email: String(user.email).toLowerCase(),
      tenantId: String(user.tenantId),
      fingerprint: userFingerprint(user),
    },
    asyncStorage,
    syncQueue,
  };

  const path = recoveryFilePath(user);
  if (!path) return null;
  const encrypted = await encryptRecoverySnapshot(snapshot);
  if (!encrypted) {
    console.warn('[RECOVERY] Falha ao cifrar backup offline (SecureStore/crypto indisponível).');
    return null;
  }
  await FileSystem.writeAsStringAsync(path, encrypted);
  return {
    path,
    keyCount: Object.keys(asyncStorage).length,
    queueCount: syncQueue.length,
  };
}

export async function restoreEmergencyOfflineBackupForUser(
  user: User | null,
): Promise<{ restored: boolean; restoredKeys: number; restoredQueueRows: number }> {
  if (!user?.id || !user?.email || !user?.tenantId) {
    return { restored: false, restoredKeys: 0, restoredQueueRows: 0 };
  }
  await cleanupExpiredBackups();
  const path = recoveryFilePath(user);
  if (!path) return { restored: false, restoredKeys: 0, restoredQueueRows: 0 };

  let snapshot: RecoverySnapshot | null = null;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return { restored: false, restoredKeys: 0, restoredQueueRows: 0 };
    const raw = await FileSystem.readAsStringAsync(path);
    snapshot = await decodeRecoverySnapshotFromFile(raw);
  } catch {
    return { restored: false, restoredKeys: 0, restoredQueueRows: 0 };
  }
  if (!snapshot || typeof snapshot !== 'object') return { restored: false, restoredKeys: 0, restoredQueueRows: 0 };
  if (snapshot.version !== RECOVERY_VERSION) return { restored: false, restoredKeys: 0, restoredQueueRows: 0 };

  const expectedFingerprint = userFingerprint(user);
  if (snapshot.identity?.fingerprint !== expectedFingerprint) {
    return { restored: false, restoredKeys: 0, restoredQueueRows: 0 };
  }
  if (!snapshot.createdAt || Date.now() - Number(snapshot.createdAt) > RECOVERY_TTL_MS) {
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      /* ignore */
    }
    return { restored: false, restoredKeys: 0, restoredQueueRows: 0 };
  }

  let restoredKeys = 0;
  const entries = Object.entries(snapshot.asyncStorage || {});
  for (const [key, incomingRaw] of entries) {
    if (!incomingRaw || typeof incomingRaw !== 'string') continue;
    try {
      const currentRaw = await AsyncStorage.getItem(key);
      let nextRaw: string | null = incomingRaw;
      if (ARRAY_MERGE_KEYS.has(key)) {
        nextRaw = mergeUniqueArrayForKey(key, currentRaw, incomingRaw);
      } else if (PREFIX_KEYS.some((p) => key.startsWith(p))) {
        if (currentRaw != null && currentRaw !== '') continue;
      } else if (currentRaw != null && currentRaw !== '') {
        continue;
      }
      if (nextRaw != null) {
        await AsyncStorage.setItem(key, nextRaw);
        restoredKeys += 1;
      }
    } catch {
      /* ignore */
    }
  }

  const existingQueueRows = getSyncQueue(user.email) as Array<Record<string, unknown>>;
  const existingQueueSet = new Set<string>();
  for (const row of existingQueueRows) {
    existingQueueSet.add(`${String(row?.action || '')}|${String(row?.payload || '')}`);
  }

  let restoredQueueRows = 0;
  for (const row of snapshot.syncQueue || []) {
    const action = String(row?.action || '').trim();
    if (!action) continue;
    const ownerEmail = row?.ownerEmail ? String(row.ownerEmail) : user.email;
    const payload = row?.payload ?? {};
    const payloadRaw = JSON.stringify(payload);
    const sig = `${action}|${payloadRaw}`;
    if (existingQueueSet.has(sig)) continue;
    try {
      queueOfflineAction(action, payload, ownerEmail);
      existingQueueSet.add(sig);
      restoredQueueRows += 1;
    } catch {
      /* ignore */
    }
  }

  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    /* ignore */
  }

  return {
    restored: restoredKeys > 0 || restoredQueueRows > 0,
    restoredKeys,
    restoredQueueRows,
  };
}
