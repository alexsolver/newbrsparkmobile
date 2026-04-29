/**
 * SyncService — orquestrador de sincronização BrSpark Cloud
 *
 * Estratégia offline-first:
 *   1. Mutações → salvas no AsyncStorage local
 *   2. Ao puxar a tela → push dos dados locais → pull dos dados do servidor
 *   3. Merge inteligente: servidor vence, dados locais-only são preservados
 *
 * Módulos: financeiro, seguros, estoque, vault, mídia, documentos, manutenção
 */
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { apiFetch, getToken } from './auth';
import { 
  getSyncQueue, clearSyncQueueItem, 
  saveStockItemLocal,
  saveStockMovementLocal,
  saveTechStockItemLocal,
  saveTechStockMovementLocal,
  getLocalStockItems,
  getLocalStockMovements,
  getLocalTechStockItems,
  getLocalTechStockMovements,
  getLocalTechFinanceEntries,
  saveTechFinanceEntryLocal,
  getLocalAssetNotesForSync,
  upsertAssetNoteFromSync,
} from '../database';
import { AuthService } from './auth';
import { ensureTechnicianStockLegacyMigration } from './technicianStockMigration';
import { uploadFile } from './storageService';
import { ensureTechFinanceAttachmentsUploaded } from './technicianFinanceAttachmentSync';
import { pushTrackingSyncQueue } from './trackingSyncQueue';
import { pushWorkTimePunchOutbox } from './workTimePunchOutbox';
import {
  metadataIndicatesAdminRevisionCycle,
  shouldRemoveExecutedCacheForRemoteTask,
} from './syncPolicy';
import { taskRowIsRoutineTask, taskEffectiveChecklistTemplateId } from '../lib/routineTaskQueueUi';
import {
  loadFtCloudTasks,
  loadRtCloudTasks,
  saveFtCloudTasks,
  saveRtCloudTasks,
  partitionFtRt,
} from '../lib/cloudTasksBuckets';
import {
  updateStoredJsonArray,
  updateStoredJsonArrayWhileLockHeld,
  withAsyncStorageKeyLock,
} from '../lib/asyncStorageAtomic';
import {
  compressLocalImageForChecklistSyncUpload,
  isProbablyVideoExt,
} from './checklistMediaUploadPrep';
import { BRSPARK_CLOUD_TASKS_UPDATED } from '../constants/deviceEvents';

// ── Push fila offline de assets ───────────────────────────────────────────────

let isSyncing = false;
/** Se `pushSyncQueue` foi chamado enquanto um ciclo já corria — agenda exatamente mais um ciclo ao terminar (coalescing). */
let pendingSyncRequested = false;
let pendingSyncOwnerEmail: string | undefined = undefined;

export const EXECUTION_STATUS_OUTBOX_KEY = '@brspark_execution_status_outbox';
const CHECKLIST_OUTBOX_KEY = '@brspark_outbox';
const CHECKLIST_OUTBOX_CONFLICTS_KEY = '@brspark_outbox_conflicts_v1';
/** Último ciclo `fullSync` que correu até ao fim (ms epoch); atualizado no final de `fullSync`. */
export const LAST_SUCCESSFUL_FULL_SYNC_AT_MS_KEY = '@brspark_last_successful_full_sync_at_ms';
const TELEMETRY_OUTBOX_KEY = '@brspark_telemetry_outbox';
const MEDIA_STUCK_ATTEMPT_THRESHOLD = 3;
const REJECTED_TASKS_KEY = '@brspark_rejected_tasks';

function normalizeStoredId(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  return s;
}

function checklistOutboxTaskId(item: any): string {
  return (
    normalizeStoredId(item?.taskId) ||
    normalizeStoredId(item?.executionId) ||
    normalizeStoredId(item?.metadata?.executionId)
  );
}

function remoteTaskStatusIsActiveForWorklist(row: any): boolean {
  const st = String(row?.status || '').toUpperCase();
  return st === 'PENDING' || st === 'RECEIVED' || st === 'ACCEPTED' || st === 'IN_PROGRESS' || st === 'PAUSED';
}

function remoteTaskShouldClearLocalReject(row: any): boolean {
  if (!row) return false;
  if (!remoteTaskStatusIsActiveForWorklist(row)) return false;
  /** Rejeição local de oferta broadcast ainda aberta é intencional; DIRECT/reaberta deve seguir o servidor. */
  if (Boolean(row.broadcastClaimPending)) return false;
  return true;
}

/** Task id em linhas de Conflitos (corrige `taskId` nulo e `identity` tipo `task:<id>`). */
function taskIdFromChecklistConflictRow(row: {
  taskId?: string | null;
  identity?: string;
  payload?: any;
}): string {
  const direct = normalizeStoredId(row?.taskId);
  if (direct) return direct;
  const fromPayload = checklistOutboxTaskId(row?.payload);
  if (fromPayload) return fromPayload;
  const iden = String(row?.identity || '').trim();
  if (iden.startsWith('task:')) return normalizeStoredId(iden.slice('task:'.length));
  return '';
}

/** Export para UI (ex.: Conflitos de Sync) quando `taskId` veio vazio na linha. */
export function resolveChecklistConflictRowTaskId(row: {
  taskId?: string | null;
  identity?: string;
  payload?: any;
}): string {
  return taskIdFromChecklistConflictRow(row);
}

function checklistOutboxSubmissionId(item: any): string {
  return normalizeStoredId(item?.metadata?.submissionId || item?.submissionId);
}

function ensureOutboxPayloadMetadata(item: any): Record<string, unknown> {
  if (!item || typeof item !== 'object') return {};
  const current = item.metadata;
  if (current && typeof current === 'object' && !Array.isArray(current)) {
    return current as Record<string, unknown>;
  }
  const next: Record<string, unknown> = {};
  (item as Record<string, unknown>).metadata = next;
  return next;
}

function truncateErrMessage(raw: unknown, max = 220): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function registerChecklistMediaUploadError(
  payload: any,
  fieldRef: string,
  err: any,
): void {
  if (!payload || typeof payload !== 'object') return;
  const md = ensureOutboxPayloadMetadata(payload);
  const codeRaw = String(err?.code || err?.name || '').trim();
  const statusRaw = Number(err?.status);
  const details = truncateErrMessage(err?.details || err?.responseText || err?.message || err);
  const code = codeRaw ? codeRaw.toUpperCase() : 'UPLOAD_UNKNOWN';
  md.__lastMediaUploadErrorCode = code;
  md.__lastMediaUploadErrorStatus =
    Number.isFinite(statusRaw) && statusRaw > 0 ? Math.floor(statusRaw) : null;
  md.__lastMediaUploadErrorField = fieldRef;
  md.__lastMediaUploadErrorMessage = details;
  md.__lastMediaUploadErrorAt = new Date().toISOString();
}

/** Ao reenfileirar a partir de Conflitos de Sync — evita reentrar logo na quarentena por contador antigo. */
function stripOutboxMediaStuckMetadata(payload: any): void {
  if (!payload || typeof payload !== 'object') return;
  const md = ensureOutboxPayloadMetadata(payload);
  delete md.__mediaUploadAttempts;
  delete md.__lastMediaUploadAttemptAt;
  delete md.__pendingLocalMediaCount;
}

function djb2Hash32(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) + h + s.charCodeAt(i);
  }
  return h >>> 0;
}

/** Identidade estável quando não há task/sub/tpl — evita `JSON.stringify` não determinístico em objetos grandes. */
function checklistOutboxIdentityKeyAnonFingerprint(item: any): string {
  try {
    const meta =
      item?.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
        ? Object.keys(item.metadata as object)
            .sort()
            .map((k) => `${k}=${String((item.metadata as any)[k]).slice(0, 80)}`)
            .join('|')
        : '';
    const resp =
      item?.responses && typeof item.responses === 'object' && !Array.isArray(item.responses)
        ? Object.keys(item.responses as object)
            .sort()
            .join(',')
        : '';
    const seed = `${meta}|keys:${resp}`;
    return String(djb2Hash32(seed));
  } catch {
    return '0';
  }
}

export function checklistOutboxIdentityKey(item: any): string {
  const sub = checklistOutboxSubmissionId(item);
  if (sub) return `sub:${sub}`;
  const task = checklistOutboxTaskId(item);
  if (task) return `task:${task}`;
  const tpl =
    normalizeStoredId(item?.templateId) || normalizeStoredId(item?.metadata?.templateId);
  const started =
    normalizeStoredId(item?.startedAt) ||
    normalizeStoredId(item?.metadata?.startedAt) ||
    normalizeStoredId(item?.responses?.__form_started_at);
  const completed =
    normalizeStoredId(item?.completedAt) ||
    normalizeStoredId(item?.metadata?.completedAt) ||
    normalizeStoredId(item?.responses?.__form_completed_at);
  const owner =
    normalizeStoredId(item?.ownerEmail) ||
    normalizeStoredId(item?.metadata?.ownerEmail);
  if (tpl || started || completed || owner) {
    return `tpl:${tpl}|st:${started}|end:${completed}|own:${owner}`;
  }
  return `fb:anon:${checklistOutboxIdentityKeyAnonFingerprint(item)}`;
}

export type ChecklistOutboxConflict = {
  id: string;
  at: number;
  identity: string;
  reason: string;
  taskId: string | null;
  submissionRevision: number | null;
  serverLastSubmittedRevision: number | null;
  serverExpectedNext: number | null;
  statusCode: number | null;
  payload: any;
};

function parseChecklistOutboxConflicts(raw: string | null): ChecklistOutboxConflict[] {
  if (!raw) return [];
  const parseNullableFiniteNumber = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row) => row && typeof row === 'object')
      .map((row) => ({
        id: String((row as any).id || `${Date.now()}_${Math.random()}`),
        at: Number((row as any).at) || Date.now(),
        identity: String((row as any).identity || ''),
        reason: String((row as any).reason || 'unknown_conflict'),
        taskId: (row as any).taskId == null ? null : String((row as any).taskId),
        submissionRevision: parseNullableFiniteNumber((row as any).submissionRevision),
        serverLastSubmittedRevision: parseNullableFiniteNumber((row as any).serverLastSubmittedRevision),
        serverExpectedNext: parseNullableFiniteNumber((row as any).serverExpectedNext),
        statusCode: parseNullableFiniteNumber((row as any).statusCode),
        payload: (row as any).payload,
      }));
  } catch {
    return [];
  }
}

export async function getChecklistOutboxConflicts(): Promise<ChecklistOutboxConflict[]> {
  try {
    const raw = await AsyncStorage.getItem(CHECKLIST_OUTBOX_CONFLICTS_KEY);
    const list = parseChecklistOutboxConflicts(raw);
    return list.sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export async function clearChecklistOutboxConflicts(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CHECKLIST_OUTBOX_CONFLICTS_KEY);
  } catch {
    /* ignore */
  }
}

export async function requeueChecklistOutboxConflicts(
  limitOrIds?: number | string[],
): Promise<{ requeued: number; remaining: number }> {
  let conflicts = await getChecklistOutboxConflicts();
  if (!Array.isArray(conflicts) || conflicts.length === 0) {
    return { requeued: 0, remaining: 0 };
  }
  if (Array.isArray(limitOrIds)) {
    const wanted = new Set(limitOrIds.map((id) => String(id)));
    conflicts = conflicts.filter((c) => wanted.has(String(c.id)));
  } else if (Number.isFinite(Number(limitOrIds)) && Number(limitOrIds) > 0) {
    conflicts = conflicts.slice(0, Math.max(0, Number(limitOrIds)));
  }

  const outboxRaw = await AsyncStorage.getItem(CHECKLIST_OUTBOX_KEY);
  let outbox: any[] = [];
  try {
    const parsed = outboxRaw ? JSON.parse(outboxRaw) : [];
    outbox = Array.isArray(parsed) ? parsed : [];
  } catch {
    outbox = [];
  }

  const byIdentity = new Map<string, any>();
  for (const item of outbox) {
    byIdentity.set(checklistOutboxIdentityKey(item), item);
  }

  let requeued = 0;
  const movedIds = new Set<string>();
  for (const c of conflicts) {
    if (!c || !c.payload || typeof c.payload !== 'object') continue;
    stripOutboxMediaStuckMetadata(c.payload);
    const identity = checklistOutboxIdentityKey(c.payload);
    byIdentity.set(identity, c.payload);
    movedIds.add(c.id);
    requeued += 1;
    const tid = checklistOutboxTaskId(c.payload);
    if (tid) {
      try {
        await AsyncStorage.setItem(`@brspark_execution_${tid}`, JSON.stringify(c.payload));
      } catch {
        /* ignore */
      }
    }
  }

  if (requeued > 0) {
    await AsyncStorage.setItem(CHECKLIST_OUTBOX_KEY, JSON.stringify([...byIdentity.values()]));
  }

  const allConflicts = await getChecklistOutboxConflicts();
  const remainingRows = allConflicts.filter((c) => !movedIds.has(c.id));
  if (remainingRows.length > 0) {
    await AsyncStorage.setItem(CHECKLIST_OUTBOX_CONFLICTS_KEY, JSON.stringify(remainingRows));
  } else {
    await AsyncStorage.removeItem(CHECKLIST_OUTBOX_CONFLICTS_KEY);
  }
  return { requeued, remaining: remainingRows.length };
}

export async function removeChecklistOutboxConflictsByIds(
  ids: string[],
): Promise<{ removed: number; remaining: number }> {
  const wanted = new Set((ids || []).map((id) => String(id)));
  if (wanted.size === 0) {
    const current = await getChecklistOutboxConflicts();
    return { removed: 0, remaining: current.length };
  }
  const current = await getChecklistOutboxConflicts();
  if (current.length === 0) return { removed: 0, remaining: 0 };
  const remainingRows = current.filter((c) => !wanted.has(String(c.id)));
  const removed = current.length - remainingRows.length;
  if (remainingRows.length > 0) {
    await AsyncStorage.setItem(CHECKLIST_OUTBOX_CONFLICTS_KEY, JSON.stringify(remainingRows));
  } else {
    await AsyncStorage.removeItem(CHECKLIST_OUTBOX_CONFLICTS_KEY);
  }
  return { removed, remaining: remainingRows.length };
}

function parseChecklistSubmissionRevision(item: any): number | null {
  const raw = item?.metadata?.submissionRevision ?? item?.submissionRevision;
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function parseChecklistSubmissionId(item: any): string {
  return normalizeStoredId(item?.metadata?.submissionId ?? item?.submissionId);
}

function ensureChecklistSubmissionId(payload: any): string {
  const current = parseChecklistSubmissionId(payload);
  if (current) return current;
  const sid = `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const md = ensureOutboxPayloadMetadata(payload);
  md.submissionId = sid;
  if (payload && typeof payload === 'object') {
    (payload as Record<string, unknown>).submissionId = sid;
  }
  return sid;
}

async function quarantineChecklistOutboxConflict(
  payload: any,
  opts: {
    reason: string;
    taskId?: string;
    submissionRevision?: number | null;
    serverLastSubmittedRevision?: number | null;
    serverExpectedNext?: number | null;
    statusCode?: number;
  },
): Promise<void> {
  const identity = checklistOutboxIdentityKey(payload);
  const resolvedTaskId =
    opts.taskId != null && String(opts.taskId).trim()
      ? String(opts.taskId).trim()
      : checklistOutboxTaskId(payload) || null;
  const row = {
    id: `${identity}|${Date.now()}`,
    at: Date.now(),
    identity,
    reason: String(opts.reason || 'unknown_conflict'),
    taskId: resolvedTaskId,
    submissionRevision:
      opts.submissionRevision != null && Number.isFinite(opts.submissionRevision)
        ? Number(opts.submissionRevision)
        : null,
    serverLastSubmittedRevision:
      opts.serverLastSubmittedRevision != null && Number.isFinite(opts.serverLastSubmittedRevision)
        ? Number(opts.serverLastSubmittedRevision)
        : null,
    serverExpectedNext:
      opts.serverExpectedNext != null && Number.isFinite(opts.serverExpectedNext)
        ? Number(opts.serverExpectedNext)
        : null,
    statusCode:
      opts.statusCode != null && Number.isFinite(opts.statusCode) ? Number(opts.statusCode) : null,
    payload,
  };

  await updateStoredJsonArray<any>(
    CHECKLIST_OUTBOX_CONFLICTS_KEY,
    (arr) => {
      const key = `${row.identity}::${row.reason}`;
      const next = [...arr];
      const idx = next.findIndex((it: any) => {
        const idn = String(it?.identity || '');
        const rsn = String(it?.reason || '');
        return `${idn}::${rsn}` === key;
      });
      if (idx >= 0) {
        next[idx] = { ...next[idx], ...row, id: String(next[idx].id || row.id) };
      } else {
        next.push(row);
      }
      return next.slice(-200);
    },
  );
}

async function preflightChecklistRevisionConflict(
  payload: any,
): Promise<{ action: 'proceed' | 'drop_as_conflict' }> {
  const taskId = checklistOutboxTaskId(payload);
  if (!taskId) return { action: 'proceed' };
  const submissionRevision = parseChecklistSubmissionRevision(payload);
  if (!submissionRevision) return { action: 'proceed' };
  const submissionId = parseChecklistSubmissionId(payload);

  try {
    const res = await apiFetch(`/api/checklists/executions/${taskId}`);
    if (res.status === 404 || res.status === 403) return { action: 'proceed' };
    if (!res.ok) return { action: 'proceed' };
    const remote = await res.json();
    const remoteLast = Number(remote?.lastSubmittedRevision);
    const lastSubmittedRevision = Number.isFinite(remoteLast) ? remoteLast : 0;
    const expectedNext = lastSubmittedRevision + 1;

    if (submissionRevision !== expectedNext) {
      if (submissionId) {
        console.warn(
          `[SYNC] Preflight revision mismatch ignorado para replay idempotente (task=${taskId}, local=${submissionRevision}, expected=${expectedNext}).`,
        );
        return { action: 'proceed' };
      }
      await quarantineChecklistOutboxConflict(payload, {
        reason: 'preflight_revision_mismatch',
        taskId,
        submissionRevision,
        serverLastSubmittedRevision: lastSubmittedRevision,
        serverExpectedNext: expectedNext,
      });
      console.warn(
        `[SYNC] Conflito de revisão detectado antes do POST (task=${taskId}, local=${submissionRevision}, expected=${expectedNext}).`,
      );
      return { action: 'drop_as_conflict' };
    }
  } catch {
    return { action: 'proceed' };
  }

  return { action: 'proceed' };
}

/** Prefixo das cópias locais do corpo da execução (respostas) — OS concluídas só devem persistir após visualização e com TTL curto. */
const EXECUTION_CACHE_PREFIX = '@brspark_execution_';

/**
 * Tempo máximo que o técnico mantém no aparelho o corpo (respostas) de uma OS já concluída na nuvem,
 * após a última visualização com download bem-sucedido (cache de leitura / reabrir).
 */
export const COMPLETED_BODY_LOCAL_TTL_MS = 4 * 60 * 60 * 1000;

/** Alinhar a `EXEC_VIEW_ONLY_STATUSES` do checklist: só estas execuções são alvo de purge por TTL. */
const TERMINAL_EXEC_CACHE_STATUSES = new Set([
  'COMPLETED',
  'SYNCED',
  'CANCELLED',
  'CANCELED',
  'DONE',
  'CLOSED',
  'FINISHED',
  'COMPLETE',
  'ARCHIVED',
]);

/**
 * Remove `@brspark_execution_*` de OS terminais na nuvem quando o download para visualização expirou
 * ou nunca foi marcado (instalações antigas). Preserva: fila de submissão pendente e estados não terminais.
 */
export async function purgeExpiredCompletedExecutionCaches(): Promise<void> {
  try {
    const outboxRaw = await AsyncStorage.getItem(CHECKLIST_OUTBOX_KEY);
    let outbox: unknown[] = [];
    try {
      outbox = outboxRaw ? JSON.parse(outboxRaw) : [];
    } catch {
      outbox = [];
    }
    if (!Array.isArray(outbox)) outbox = [];
    const outboxTaskIds = new Set(outbox.map((o: any) => checklistOutboxTaskId(o)).filter(Boolean));

    const allKeys = await AsyncStorage.getAllKeys();
    const execKeys = allKeys.filter((k) => k.startsWith(EXECUTION_CACHE_PREFIX));
    const now = Date.now();

    for (const key of execKeys) {
      const id = key.slice(EXECUTION_CACHE_PREFIX.length);
      if (!id || outboxTaskIds.has(id)) continue;

      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;

      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!obj || typeof obj !== 'object') continue;

      const st = String(obj.status || '').toUpperCase();
      if (!TERMINAL_EXEC_CACHE_STATUSES.has(st)) continue;

      const dl = Number(obj._technicianViewDownloadAt);
      if (!Number.isFinite(dl) || now - dl > COMPLETED_BODY_LOCAL_TTL_MS) {
        await AsyncStorage.removeItem(key);
        console.log(`[SYNC] Cache de corpo concluído removido (expirado ou sem marcação): ${id}`);
      }
    }
  } catch (e) {
    console.warn('[SYNC] purgeExpiredCompletedExecutionCaches:', e);
  }
}

export type ExecutionStatusPatchBody = Record<string, unknown>;

/**
 * PATCH /api/checklists/executions/:taskId/status — tenta já; se falhar, guarda para o próximo pushSyncQueue.
 */
export async function enqueueExecutionStatusPatch(
  taskId: string,
  body: ExecutionStatusPatchBody
): Promise<void> {
  if (!taskId || typeof taskId !== 'string') return;
  try {
    const res = await apiFetch(`/api/checklists/executions/${taskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return;
  } catch {
    /* offline */
  }
  try {
    await updateStoredJsonArray<{ taskId: string; body: ExecutionStatusPatchBody; queuedAt: number }>(
      EXECUTION_STATUS_OUTBOX_KEY,
      (arr) => [...arr, { taskId, body, queuedAt: Date.now() }]
    );
  } catch (e) {
    console.warn('[SYNC] Falha ao enfileirar PATCH de estado da OS:', e);
  }
}

export async function clearExecutionStatusOutboxForTask(taskId: string): Promise<void> {
  const id = String(taskId || '').trim();
  if (!id) return;
  try {
    await updateStoredJsonArray<{ taskId?: string; body?: ExecutionStatusPatchBody; queuedAt?: number }>(
      EXECUTION_STATUS_OUTBOX_KEY,
      (arr) => arr.filter((item) => String(item?.taskId || '') !== id),
      { removeWhenEmpty: true }
    );
  } catch (e) {
    console.warn('[SYNC] clearExecutionStatusOutboxForTask:', e);
  }
}

function executionStatusOutboxItemKey(item: {
  taskId?: string;
  body?: ExecutionStatusPatchBody;
  queuedAt?: number;
}): string {
  const taskId = String(item?.taskId || '').trim();
  const queuedAt = Number(item?.queuedAt) || 0;
  const body = item?.body && typeof item.body === 'object' ? item.body : {};
  return `${taskId}|${queuedAt}|${JSON.stringify(body)}`;
}

async function pushExecutionStatusOutbox(): Promise<void> {
  try {
    let arr: { taskId: string; body: ExecutionStatusPatchBody; queuedAt?: number }[] = [];
    await withAsyncStorageKeyLock(EXECUTION_STATUS_OUTBOX_KEY, async () => {
      const raw = await AsyncStorage.getItem(EXECUTION_STATUS_OUTBOX_KEY);
      if (!raw) {
        arr = [];
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        arr = Array.isArray(parsed) ? parsed : [];
      } catch {
        const backupKey = `${EXECUTION_STATUS_OUTBOX_KEY}_corrupt_${Date.now()}`;
        try {
          await AsyncStorage.setItem(backupKey, raw);
          await AsyncStorage.removeItem(EXECUTION_STATUS_OUTBOX_KEY);
        } catch {
          /* ignore */
        }
        arr = [];
      }
    });
    if (!Array.isArray(arr) || arr.length === 0) return;

    const deliveredKeys = new Set<string>();
    for (const item of arr) {
      if (!item?.taskId || !item.body) continue;
      try {
        const res = await apiFetch(`/api/checklists/executions/${item.taskId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.body),
        });
        if (res.ok) {
          deliveredKeys.add(executionStatusOutboxItemKey(item));
        }
      } catch {
        /* mantém item na fila */
      }
    }
    if (deliveredKeys.size > 0) {
      await updateStoredJsonArray<{ taskId: string; body: ExecutionStatusPatchBody; queuedAt?: number }>(
        EXECUTION_STATUS_OUTBOX_KEY,
        (current) => current.filter((item) => !deliveredKeys.has(executionStatusOutboxItemKey(item))),
        { removeWhenEmpty: true }
      );
    }
  } catch (e) {
    console.warn('[SYNC] pushExecutionStatusOutbox:', e);
  }
}

async function getTaskIdsWithPendingChecklistOutbox(): Promise<Set<string>> {
  const ids = new Set<string>();
  try {
    const raw = await AsyncStorage.getItem(CHECKLIST_OUTBOX_KEY);
    let outbox: unknown[] = [];
    try {
      outbox = raw ? JSON.parse(raw) : [];
    } catch {
      outbox = [];
    }
    if (!Array.isArray(outbox)) return ids;
    for (const item of outbox) {
      const id = checklistOutboxTaskId(item);
      if (id) ids.add(id);
    }
  } catch {
    /* ignore */
  }
  /** Mídia presa / outros: payload saiu da outbox principal mas ainda está em Conflitos de Sync. */
  try {
    const conflicts = await getChecklistOutboxConflicts();
    for (const row of conflicts) {
      const tid = taskIdFromChecklistConflictRow(row);
      if (tid) ids.add(tid);
    }
  } catch {
    /* ignore */
  }
  return ids;
}

/**
 * Checklist concluído no aparelho com POST ainda pendente (outbox principal ou Conflitos de Sync).
 * Usar na UI da aba «Concluídas» junto com `@brspark_executed_tasks`.
 */
export async function getTaskIdsWithCompletedChecklistPendingServerAck(): Promise<Set<string>> {
  return getTaskIdsWithPendingChecklistOutbox();
}

/** Com rede: devolve automaticamente conflitos só por mídia à outbox para novo ciclo de upload+POST. */
async function autoRequeueMediaStuckConflictsBeforeChecklistPush(): Promise<void> {
  try {
    const netState = await Network.getNetworkStateAsync();
    if (netState?.isConnected !== true) return;
    const conflicts = await getChecklistOutboxConflicts();
    const stuck = conflicts.filter((c) => String(c.reason || '') === 'media_upload_stuck');
    if (stuck.length === 0) return;
    await requeueChecklistOutboxConflicts(stuck.map((c) => String(c.id)));
    console.log(
      `[SYNC] Mídia: reenfileiramento automático de ${stuck.length} payload(s) (conflito → outbox).`,
    );
  } catch (e) {
    console.warn('[SYNC] autoRequeueMediaStuck:', e);
  }
}

export async function pushSyncQueue(ownerEmail?: string): Promise<void> {
  if (isSyncing) {
    pendingSyncRequested = true;
    if (ownerEmail !== undefined && String(ownerEmail).trim() !== '') {
      pendingSyncOwnerEmail = ownerEmail;
    }
    console.log('[SYNC] Sincronização já em andamento — pedido adiado (coalescing).');
    return;
  }
  isSyncing = true;
  try {
    try {
      // 0. Enviar eventos de telemetria primeiro (dados de coleta)
      await pushTelemetryBatch();

      // 0b. Pausa/retomada do link público (enfileirado offline no mapa ao vivo)
      await pushTrackingSyncQueue();

      // 0b2. Batidas de ponto enfileiradas offline (verify-face + POST quando houver rede)
      await pushWorkTimePunchOutbox();

      // 0c. PATCH de estado de execução (ex.: PAUSED / IN_PROGRESS) enfileirado offline
      await pushExecutionStatusOutbox();

      // 1. Prioridade: Enviar checklists concluídos offline
      await pushChecklistOutbox();

      // 2. Fila genérica
      const queue = getSyncQueue(ownerEmail);
      if (queue.length === 0) return;

      try {
        const res = await apiFetch('/api/sync/push', {
          method: 'POST',
          body: JSON.stringify({ queue }),
          headers: ownerEmail ? { 'x-owner-email': ownerEmail } : {},
        });
        if (res.ok) {
          const data = await res.json();
          console.log(`[SYNC] Push de ${data.processed}/${queue.length} itens genéricos concluído.`);
          const processedIds = data.processedIds || [];
          for (const item of queue) {
            if (processedIds.includes((item as any).id || (item as any).payload?.id)) {
              clearSyncQueueItem((item as any).id);
            }
          }
        } else {
          console.warn(`[SYNC] Push genérico não-OK (${res.status}), fila com ${queue.length} itens.`);
        }
      } catch (e) {
        console.warn('[SYNC] Falha de conexão durante o push genérico.', e);
      }
    } catch (e) {
      console.warn('[SYNC] pushSyncQueue interrompido (rede ou dados locais):', e);
    }
  } finally {
    isSyncing = false;
    if (pendingSyncRequested) {
      pendingSyncRequested = false;
      const nextEmail =
        pendingSyncOwnerEmail !== undefined && String(pendingSyncOwnerEmail).trim() !== ''
          ? pendingSyncOwnerEmail
          : ownerEmail;
      pendingSyncOwnerEmail = undefined;
      void pushSyncQueue(nextEmail);
    }
  }
}

// ── Helpers genéricos ─────────────────────────────────────────────────────────

/** Linhas de secção repetível — mídia aqui estava fora do upload (só a raiz era percorrida). */
const SECTION_REPEAT_KEY_PREFIX = '__section_repeat_';

/** URIs locais que precisam de upload antes do POST da execução (não enviar file:// / content:// ao servidor). */
function isLocalMediaUri(val: unknown): boolean {
  if (typeof val !== 'string' || !val.trim()) return false;
  const base = val.split('?')[0].trim().toLowerCase();
  if (base.startsWith('http://') || base.startsWith('https://')) return false;
  if (base.startsWith('file://')) return true;
  if (base.startsWith('file:/')) return true;
  if (base.startsWith('content://')) return true;
  if (base.startsWith('ph://') || base.startsWith('assets-library://')) return true;
  if (base.startsWith('/')) return true;
  return false;
}

function guessExtFromUri(uri: string): string {
  const pathOnly = uri.split('?')[0];
  const m = pathOnly.match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  return 'jpg';
}

/**
 * Garante caminho file:// legível por readAsStringAsync (Android content://, iOS ph://, etc.).
 */
async function ensureUploadableFileUri(uri: string): Promise<string> {
  const withoutQuery = uri.split('?')[0];
  if (withoutQuery.startsWith('file://')) return withoutQuery;
  if (withoutQuery.startsWith('file:/')) {
    return withoutQuery.startsWith('file:///')
      ? withoutQuery
      : `file://${withoutQuery.slice('file:'.length)}`;
  }
  if (withoutQuery.startsWith('/')) return `file://${withoutQuery}`;
  if (
    withoutQuery.startsWith('content://') ||
    withoutQuery.startsWith('ph://') ||
    withoutQuery.startsWith('assets-library://')
  ) {
    const ext = guessExtFromUri(withoutQuery);
    const dest = `${FileSystem.cacheDirectory}chk_sync_${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
    await FileSystem.copyAsync({ from: withoutQuery, to: dest });
    return dest;
  }
  return withoutQuery;
}

/** Reanexa à URL pública os parâmetros úteis da URI local (captura/GPS) perdidos no upload. */
function appendPreservedMediaQuery(publicUrl: string, originalLocalUri: string): string {
  if (!publicUrl || typeof originalLocalUri !== 'string') return publicUrl;
  const qi = originalLocalUri.indexOf('?');
  if (qi < 0) return publicUrl;
  const rawQ = originalLocalUri.slice(qi + 1);
  if (!rawQ.trim()) return publicUrl;
  try {
    const sp = new URLSearchParams(rawQ);
    const qp = new URLSearchParams();
    for (const k of ['live', 'capturedAt', 'lat', 'lng', 'addr']) {
      const v = sp.get(k);
      if (v != null && String(v).trim() !== '') qp.set(k, v);
    }
    if ([...qp.keys()].length === 0) return publicUrl;
    const frag = qp.toString();
    const sep = publicUrl.includes('?') ? '&' : '?';
    return `${publicUrl}${sep}${frag}`;
  } catch {
    return publicUrl;
  }
}

async function uploadOneLocalMediaField(
  localUriWithMaybeQuery: string,
  payload: { taskId?: string; templateId?: string; ownerEmail?: string },
  fieldKey: string,
  indexSuffix: string
): Promise<string | null> {
  const emailSafe = (payload.ownerEmail || 'anon').replace(/[^a-zA-Z0-9]/g, '_');
  const readable = await ensureUploadableFileUri(localUriWithMaybeQuery);
  const readableIsTempCopy = readable.includes('chk_sync_');

  let ext0 = guessExtFromUri(readable) || 'jpg';
  let uploadUri = readable;
  if (!isProbablyVideoExt(ext0)) {
    try {
      uploadUri = await compressLocalImageForChecklistSyncUpload(readable);
    } catch {
      uploadUri = readable;
    }
  }

  let ext = guessExtFromUri(uploadUri) || 'jpg';
  if (ext === 'jpeg') ext = 'jpg';
  const remotePath = `checklists/${emailSafe}/${payload.taskId || payload.templateId}_${fieldKey}${indexSuffix}_${Date.now()}.${ext}`;
  console.log(`[SYNC] Upload mídia checklist: ${uploadUri.slice(0, 80)}… → ${remotePath}`);

  try {
    const upRes = await uploadFile(uploadUri, remotePath);
    return upRes?.url || null;
  } finally {
    try {
      if (uploadUri !== readable) {
        await FileSystem.deleteAsync(uploadUri, { idempotent: true });
      }
      if (readableIsTempCopy) {
        await FileSystem.deleteAsync(readable, { idempotent: true });
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Visão IA / foto com anotações: URIs ficam dentro de objetos (`localUri`, `gridSlotUris`, `imageUri`),
 * ou dentro de uma **string JSON** (`JSON.stringify` no app) — o upload plano só via `file://` no topo
 * e objetos já parseados; strings JSON com `imageUri` local eram ignoradas até o POST.
 */
async function maybeUploadNestedChecklistFieldMedia(
  fieldKey: string,
  nested: Record<string, unknown>,
  payload: { taskId?: string; templateId?: string; ownerEmail?: string }
): Promise<Record<string, unknown> | null> {
  const o: Record<string, unknown> = { ...nested };
  let changed = false;

  const lu = o.localUri;
  if (typeof lu === 'string' && isLocalMediaUri(lu)) {
    try {
      const url = await uploadOneLocalMediaField(lu, payload, fieldKey, '_vision');
      if (url) {
        o.localUri = appendPreservedMediaQuery(url, lu);
        changed = true;
        console.log(`[SYNC] Campo ${fieldKey}.localUri → URL remota`);
      }
    } catch (e: any) {
      registerChecklistMediaUploadError(payload, `${fieldKey}.localUri`, e);
      console.warn(`[SYNC] Falha upload ${fieldKey}.localUri:`, e?.message || e);
    }
  }

  const slotsRaw = o.gridSlotUris;
  if (Array.isArray(slotsRaw)) {
    const next: unknown[] = [];
    let slotChanged = false;
    for (let i = 0; i < slotsRaw.length; i++) {
      const item = slotsRaw[i];
      if (typeof item === 'string' && isLocalMediaUri(item)) {
        try {
          const url = await uploadOneLocalMediaField(item, payload, fieldKey, `_grid${i}`);
          if (url) {
            next.push(appendPreservedMediaQuery(url, item));
            slotChanged = true;
            continue;
          }
        } catch (e: any) {
          registerChecklistMediaUploadError(payload, `${fieldKey}.gridSlotUris[${i}]`, e);
          console.warn(`[SYNC] Falha upload ${fieldKey}.gridSlotUris[${i}]:`, e?.message || e);
        }
      }
      next.push(item);
    }
    if (slotChanged) {
      o.gridSlotUris = next;
      changed = true;
    }
  }

  const annUriRaw =
    typeof o.imageUri === 'string' && String(o.imageUri).trim()
      ? String(o.imageUri).trim()
      : typeof o.uri === 'string' && String(o.uri).trim() && Array.isArray(o.strokes)
        ? String(o.uri).trim()
        : '';
  if (annUriRaw && isLocalMediaUri(annUriRaw)) {
    try {
      const url = await uploadOneLocalMediaField(annUriRaw, payload, fieldKey, '_annot');
      if (url) {
        const withQ = appendPreservedMediaQuery(url, annUriRaw);
        o.imageUri = withQ;
        if (typeof o.uri === 'string' && String(o.uri).trim() === annUriRaw) o.uri = withQ;
        changed = true;
        console.log(`[SYNC] Campo ${fieldKey} (foto com anotações) → URL remota`);
      }
    } catch (e: any) {
      registerChecklistMediaUploadError(payload, `${fieldKey}.imageUri`, e);
      console.warn(`[SYNC] Falha upload anotações ${fieldKey}:`, e?.message || e);
    }
  }

  return changed ? o : null;
}

/** Upload de mídia local num mapa plano de respostas (raiz ou uma linha de secção repetível). */
async function uploadLocalMediaInFlatResponseRecord(
  record: Record<string, unknown>,
  payload: { taskId?: string; templateId?: string; ownerEmail?: string }
): Promise<void> {
  for (const key of Object.keys(record)) {
    if (key.startsWith('__')) continue;

    const val = record[key];

    // Foto com anotações / visão IA: o app grava `JSON.stringify({ imageUri, strokes, … })`.
    // A string completa não é `file://…`, por isso o ramo de objeto aninhado nunca corria — o POST ia com URI local e o PDF acusa sempre «só no dispositivo».
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const updated = await maybeUploadNestedChecklistFieldMedia(
              key,
              parsed as Record<string, unknown>,
              payload,
            );
            if (updated) {
              record[key] = JSON.stringify(updated);
              console.log(`[SYNC] Campo ${key} (JSON com mídia aninhada) atualizado para URL remota`);
              continue;
            }
          }
        } catch {
          /* não é JSON — segue fluxo normal */
        }
      }
    }

    if (typeof val === 'string' && isLocalMediaUri(val)) {
      try {
        const url = await uploadOneLocalMediaField(val, payload, key, '');
        if (url) {
          record[key] = appendPreservedMediaQuery(url, val);
          console.log(`[SYNC] Campo ${key} → URL remota`);
        }
      } catch (e: any) {
        registerChecklistMediaUploadError(payload, key, e);
        console.warn(`[SYNC] Falha upload mídia campo ${key}:`, e?.message || e);
      }
      continue;
    }

    if (Array.isArray(val)) {
      let anyChange = false;
      const next: unknown[] = [];
      for (let i = 0; i < val.length; i++) {
        const item = val[i];
        if (typeof item === 'string') {
          const it = item.trim();
          if (it.startsWith('{')) {
            try {
              const parsed = JSON.parse(it) as unknown;
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const updated = await maybeUploadNestedChecklistFieldMedia(
                  `${key}_i${i}`,
                  parsed as Record<string, unknown>,
                  payload,
                );
                if (updated) {
                  next.push(JSON.stringify(updated));
                  anyChange = true;
                  continue;
                }
              }
            } catch {
              /* ignore */
            }
          }
        }
        if (typeof item === 'string' && isLocalMediaUri(item)) {
          try {
            const url = await uploadOneLocalMediaField(item, payload, key, `_i${i}`);
            if (url) {
              next.push(appendPreservedMediaQuery(url, item));
              anyChange = true;
              continue;
            }
          } catch (e: any) {
            registerChecklistMediaUploadError(payload, `${key}[${i}]`, e);
            console.warn(`[SYNC] Falha upload mídia ${key}[${i}]:`, e?.message || e);
          }
        }
        next.push(item);
      }
      if (anyChange) record[key] = next;
      continue;
    }

    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const updated = await maybeUploadNestedChecklistFieldMedia(
        key,
        val as Record<string, unknown>,
        payload,
      );
      if (updated) record[key] = updated;
    }
  }
}

/** Substitui file:// / content:// / arrays de URIs por URLs públicas antes de POST /executions (raiz + secções repetíveis). */
async function uploadLocalMediaInChecklistPayload(payload: any): Promise<void> {
  if (!payload?.responses || typeof payload.responses !== 'object') return;
  const responses = payload.responses as Record<string, unknown>;

  await uploadLocalMediaInFlatResponseRecord(responses, payload);

  for (const key of Object.keys(responses)) {
    if (!key.startsWith(SECTION_REPEAT_KEY_PREFIX)) continue;
    const rows = responses[key];
    if (!Array.isArray(rows)) continue;
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      await uploadLocalMediaInFlatResponseRecord(row as Record<string, unknown>, payload);
    }
  }
}

function responseValueHasPendingLocalMedia(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (isLocalMediaUri(trimmed)) return true;
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length <= 2_000_000) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return responseValueHasPendingLocalMedia(parsed, depth + 1);
      } catch {
        return false;
      }
    }
    return false;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (responseValueHasPendingLocalMedia(item, depth + 1)) return true;
    }
    return false;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (responseValueHasPendingLocalMedia(v, depth + 1)) return true;
    }
    return false;
  }
  return false;
}

function responseValuePendingLocalMediaCount(value: unknown, depth = 0): number {
  if (depth > 8) return 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (isLocalMediaUri(trimmed)) return 1;
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length <= 2_000_000) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        return responseValuePendingLocalMediaCount(parsed, depth + 1);
      } catch {
        return 0;
      }
    }
    return 0;
  }
  if (Array.isArray(value)) {
    let total = 0;
    for (const item of value) total += responseValuePendingLocalMediaCount(item, depth + 1);
    return total;
  }
  if (value && typeof value === 'object') {
    let total = 0;
    for (const v of Object.values(value as Record<string, unknown>)) {
      total += responseValuePendingLocalMediaCount(v, depth + 1);
    }
    return total;
  }
  return 0;
}

function checklistPayloadHasPendingLocalMedia(payload: any): boolean {
  const responses = payload?.responses;
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return false;
  return responseValueHasPendingLocalMedia(responses);
}

function checklistPayloadPendingLocalMediaCount(payload: any): number {
  const responses = payload?.responses;
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return 0;
  return responseValuePendingLocalMediaCount(responses);
}

function collectPendingLocalMediaUris(
  value: unknown,
  out: string[],
  depth = 0,
  limit = 5,
): void {
  if (out.length >= limit || depth > 8) return;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (isLocalMediaUri(trimmed)) {
      out.push(trimmed);
      return;
    }
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length <= 2_000_000) {
      try {
        collectPendingLocalMediaUris(JSON.parse(trimmed) as unknown, out, depth + 1, limit);
      } catch {
        /* ignore invalid json */
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const it of value) {
      collectPendingLocalMediaUris(it, out, depth + 1, limit);
      if (out.length >= limit) return;
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectPendingLocalMediaUris(v, out, depth + 1, limit);
      if (out.length >= limit) return;
    }
  }
}

async function inferPendingLocalMediaHint(payload: any): Promise<string> {
  const md =
    payload?.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? (payload.metadata as Record<string, unknown>)
      : null;
  const errCode = String(md?.__lastMediaUploadErrorCode || '').trim();
  const errStatus = Number(md?.__lastMediaUploadErrorStatus);
  const errField = String(md?.__lastMediaUploadErrorField || '').trim();
  const errMsg = String(md?.__lastMediaUploadErrorMessage || '').trim();
  if (errCode) {
    const statusPart = Number.isFinite(errStatus) ? ` (HTTP ${Math.floor(errStatus)})` : '';
    const fieldPart = errField ? ` em ${errField}` : '';
    if (errCode === 'PAYLOAD_TOO_LARGE') {
      return `Falha por arquivo grande${fieldPart}${statusPart}. Reduza/comprima a mídia e reenfileire.`;
    }
    return `Falha de upload ${errCode}${fieldPart}${statusPart}${errMsg ? `: ${truncateErrMessage(errMsg, 140)}` : ''}`;
  }

  const responses = payload?.responses;
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return '';
  const uris: string[] = [];
  collectPendingLocalMediaUris(responses, uris, 0, 3);
  if (uris.length === 0) return 'Mídia local pendente sem URI identificável.';
  const first = uris[0];
  const firstNoQuery = first.split('?')[0].trim();
  if (
    firstNoQuery.startsWith('content://') ||
    firstNoQuery.startsWith('ph://') ||
    firstNoQuery.startsWith('assets-library://')
  ) {
    return `URI pendente (${firstNoQuery.slice(0, 48)}...) depende de leitura/cópia local antes do upload.`;
  }
  try {
    const uploadable = await ensureUploadableFileUri(first);
    const info = await FileSystem.getInfoAsync(uploadable);
    if (!info?.exists) {
      return `Arquivo local ausente (${firstNoQuery.slice(0, 64)}...) — provável limpeza de cache do sistema.`;
    }
    const sz = Number((info as any).size);
    const sizeHint = Number.isFinite(sz) && sz > 0 ? ` (${Math.round(sz / 1024)} KB)` : '';
    return `Arquivo local existe${sizeHint}, mas upload não concluiu. Verifique rede e backend de storage.`;
  } catch (e: any) {
    return `Falha ao validar arquivo local (${firstNoQuery.slice(0, 64)}...): ${String(e?.message || e)}`.slice(0, 220);
  }
}

function formatReverseGeocodeLine(p: Location.LocationGeocodedAddress): string {
  return `${p.street || p.name || ''}, ${p.streetNumber || ''} - ${p.district || p.subregion || ''}, ${p.city || ''} - ${p.region || ''}`;
}

function transitNeedsOfflineAddressFill(o: Record<string, unknown>): boolean {
  const action = String(o.action || '');
  if (action !== 'SAIDA' && action !== 'CHEGADA') return false;
  if (o.geofence != null) return false;
  const c = o.coordinates as { lat?: unknown; lng?: unknown } | undefined;
  const lat = Number(c?.lat);
  const lng = Number(c?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return false;
  const addr = String(o.address || '').trim();
  if (addr === 'A obter endereço…' || addr === 'A obter endereço...') return true;
  if (!addr) return true;
  return false;
}

/**
 * Antes do POST da outbox (com rede): preenche moradas de SAIDA/CHEGADA que ficaram em «A obter endereço…»
 * quando a conclusão foi offline — mesmo raciocínio do IIFE no checklist, mas aplicado ao payload em fila.
 */
async function maybeEnrichTransitJsonString(raw: string): Promise<string | null> {
  const t = raw.trim();
  if (!t.startsWith('{')) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  if (!transitNeedsOfflineAddressFill(o)) return null;
  const c = o.coordinates as { lat?: unknown; lng?: unknown };
  const lat = Number(c?.lat);
  const lng = Number(c?.lng);
  try {
    const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (rev?.length) {
      const line = formatReverseGeocodeLine(rev[0]).trim();
      if (!line) return null;
      return JSON.stringify({ ...o, address: line });
    }
  } catch {
    return null;
  }
  return null;
}

function locationPickNeedsAddressFill(o: Record<string, unknown>): boolean {
  if (o.version !== 1) return false;
  const gps = o.gps as { lat?: unknown; lng?: unknown } | undefined;
  const pin = o.pin as { lat?: unknown; lng?: unknown } | undefined;
  if (!gps || !pin) return false;
  const gl = Number(gps.lat);
  const gg = Number(gps.lng);
  const pl = Number(pin.lat);
  const pg = Number(pin.lng);
  if (![gl, gg, pl, pg].every((n) => Number.isFinite(n))) return false;
  const pend = (s: string) =>
    !s.trim() || s.trim() === 'A obter endereço…' || s.trim() === 'A obter endereço...';
  return pend(String(o.addressGps ?? '')) || pend(String(o.addressPin ?? ''));
}

async function maybeEnrichLocationPickJsonString(raw: string): Promise<string | null> {
  const t = raw.trim();
  if (!t.startsWith('{')) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  if (!locationPickNeedsAddressFill(o)) return null;
  const gps = o.gps as { lat: number; lng: number };
  const pin = o.pin as { lat: number; lng: number };
  const prevG = String(o.addressGps ?? '').trim();
  const prevP = String(o.addressPin ?? '').trim();
  const pend = (s: string) =>
    !s || s === 'A obter endereço…' || s === 'A obter endereço...';
  const fallback = 'Endereço indisponível (rede ou mapas).';
  let lineG: string | null = null;
  let lineP: string | null = null;
  try {
    const [r1, r2] = await Promise.all([
      pend(prevG) ? Location.reverseGeocodeAsync({ latitude: gps.lat, longitude: gps.lng }) : Promise.resolve(null),
      pend(prevP) ? Location.reverseGeocodeAsync({ latitude: pin.lat, longitude: pin.lng }) : Promise.resolve(null),
    ]);
    if (r1?.length) {
      const ln = formatReverseGeocodeLine(r1[0]).trim();
      if (ln) lineG = ln;
    }
    if (r2?.length) {
      const ln = formatReverseGeocodeLine(r2[0]).trim();
      if (ln) lineP = ln;
    }
  } catch {
    /* mantém nulls */
  }
  const nextG = pend(prevG) ? lineG || fallback : prevG;
  const nextP = pend(prevP) ? lineP || fallback : prevP;
  return JSON.stringify({ ...o, addressGps: nextG, addressPin: nextP });
}

async function maybeEnrichGpsBackedJsonString(raw: string): Promise<string | null> {
  const t = await maybeEnrichTransitJsonString(raw);
  if (t != null) return t;
  return maybeEnrichLocationPickJsonString(raw);
}

async function enrichGpsDerivedAddressesInResponsesTree(responses: Record<string, unknown>): Promise<number> {
  let n = 0;
  for (const k of Object.keys(responses)) {
    if (k.startsWith('__') && !k.startsWith(SECTION_REPEAT_KEY_PREFIX)) continue;
    const v = responses[k];
    if (typeof v === 'string') {
      const next = await maybeEnrichGpsBackedJsonString(v);
      if (next != null) {
        responses[k] = next;
        n++;
      }
    } else if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const row = v[i];
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          n += await enrichGpsDerivedAddressesInResponsesTree(row as Record<string, unknown>);
        }
      }
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      n += await enrichGpsDerivedAddressesInResponsesTree(v as Record<string, unknown>);
    }
  }
  return n;
}

async function enrichPendingGpsDerivedAddressesInOutbox(outbox: any[]): Promise<number> {
  try {
    const netState = await Network.getNetworkStateAsync();
    if (netState.isConnected !== true) return 0;
  } catch {
    return 0;
  }
  let total = 0;
  for (const payload of outbox) {
    const r = payload?.responses;
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    total += await enrichGpsDerivedAddressesInResponsesTree(r as Record<string, unknown>);
  }
  return total;
}

const FACIAL_BIOMETRIC_KEY_SUFFIX = '__biometric';
const FACIAL_ADDR_FALLBACK_SYNC = 'Endereço indisponível (rede ou mapas).';

function parseLatLngFromUriQueryForFacialSync(uri: string): { lat: number; lng: number } | null {
  const qi = uri.indexOf('?');
  if (qi < 0) return null;
  try {
    const sp = new URLSearchParams(uri.slice(qi + 1));
    const lat = Number(sp.get('lat'));
    const lng = Number(sp.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

function facialLineFromGeocodeEntry(r: Location.LocationGeocodedAddress): string {
  return `${r.street || r.name}, ${r.streetNumber || 'S/N'} - ${r.subregion || r.city || r.district || r.region}`.trim();
}

function applyFacialAddrToLocalMediaUri(uri: string, line: string, lat: number, lng: number): string {
  const qi = uri.indexOf('?');
  const base = qi >= 0 ? uri.slice(0, qi) : uri;
  let params: URLSearchParams;
  try {
    params = qi >= 0 ? new URLSearchParams(uri.slice(qi + 1)) : new URLSearchParams();
  } catch {
    return uri;
  }
  params.set('addr', line);
  const curLat = params.get('lat');
  const curLng = params.get('lng');
  if (curLat == null || String(curLat).trim() === '') params.set('lat', String(lat));
  if (curLng == null || String(curLng).trim() === '') params.set('lng', String(lng));
  return `${base}?${params.toString()}`;
}

/**
 * Antes do upload: preenche `captureAddr` em `{campo}__biometric` e `addr=` na URI local quando há lat/lng
 * (corrida com `mergeAddrIntoMediaUriIfStillCurrent` ou falha silenciosa do reverse geocode na UI).
 */
async function enrichFacialBiometricAddressesInFlatRecord(record: Record<string, unknown>): Promise<number> {
  let n = 0;
  for (const key of Object.keys(record)) {
    if (key.startsWith('__') && !key.startsWith(SECTION_REPEAT_KEY_PREFIX)) continue;
    if (!key.endsWith(FACIAL_BIOMETRIC_KEY_SUFFIX)) continue;
    const raw = record[key];
    if (typeof raw !== 'string' || !raw.trim().startsWith('{')) continue;
    let bio: Record<string, unknown>;
    try {
      bio = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!bio || typeof bio !== 'object' || Array.isArray(bio)) continue;
    if (bio.captureAddr != null && String(bio.captureAddr).trim() !== '') continue;

    let lat = Number(bio.captureLat);
    let lng = Number(bio.captureLng);
    const fieldId = key.slice(0, -FACIAL_BIOMETRIC_KEY_SUFFIX.length);
    const mediaVal = record[fieldId];

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      const candidates: string[] = [];
      if (typeof mediaVal === 'string' && mediaVal) candidates.push(mediaVal);
      else if (Array.isArray(mediaVal)) {
        for (const it of mediaVal) {
          if (typeof it === 'string' && it) candidates.push(it);
        }
      }
      let parsed: { lat: number; lng: number } | null = null;
      for (const u of candidates) {
        parsed = parseLatLngFromUriQueryForFacialSync(u);
        if (parsed) break;
      }
      if (!parsed) continue;
      lat = parsed.lat;
      lng = parsed.lng;
    }

    let line = '';
    try {
      const rev = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (rev?.length) line = facialLineFromGeocodeEntry(rev[0]!);
    } catch {
      line = '';
    }
    if (!line) line = FACIAL_ADDR_FALLBACK_SYNC;

    record[key] = JSON.stringify({
      ...bio,
      captureLat: String(lat),
      captureLng: String(lng),
      captureAddr: line,
    });

    if (typeof mediaVal === 'string' && isLocalMediaUri(mediaVal)) {
      record[fieldId] = applyFacialAddrToLocalMediaUri(mediaVal, line, lat, lng);
    } else if (Array.isArray(mediaVal)) {
      record[fieldId] = mediaVal.map((it) =>
        typeof it === 'string' && isLocalMediaUri(it) ? applyFacialAddrToLocalMediaUri(it, line, lat, lng) : it
      );
    }
    n += 1;
  }
  return n;
}

async function enrichFacialBiometricAddressesInResponsesTree(responses: Record<string, unknown>): Promise<number> {
  let n = await enrichFacialBiometricAddressesInFlatRecord(responses);
  for (const k of Object.keys(responses)) {
    if (!k.startsWith(SECTION_REPEAT_KEY_PREFIX)) continue;
    const rows = responses[k];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        n += await enrichFacialBiometricAddressesInFlatRecord(row as Record<string, unknown>);
      }
    }
  }
  return n;
}

async function enrichFacialBiometricAddressesInOutbox(outbox: any[]): Promise<number> {
  try {
    const netState = await Network.getNetworkStateAsync();
    if (netState.isConnected !== true) return 0;
  } catch {
    return 0;
  }
  let total = 0;
  for (const payload of outbox) {
    const r = payload?.responses;
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    total += await enrichFacialBiometricAddressesInResponsesTree(r as Record<string, unknown>);
  }
  return total;
}

/**
 * Envio da outbox de checklists. O corpo principal corre dentro de `withAsyncStorageKeyLock(@brspark_outbox)`;
 * outras escritas na mesma chave devem usar `updateStoredJsonArray` (lock por chave) ou este fluxo — nunca `setItem` solto.
 */
async function pushChecklistOutbox() {
  try {
    await autoRequeueMediaStuckConflictsBeforeChecklistPush();

    await withAsyncStorageKeyLock(CHECKLIST_OUTBOX_KEY, async () => {
     const raw = await AsyncStorage.getItem(CHECKLIST_OUTBOX_KEY);
     if (!raw) return;
     let outbox: any[] = [];
     try {
       outbox = JSON.parse(raw);
       if (!Array.isArray(outbox)) outbox = [];
     } catch (parseErr) {
       const backupKey = `@brspark_outbox_corrupt_${Date.now()}`;
       try {
         await AsyncStorage.setItem(backupKey, raw);
         await AsyncStorage.removeItem(CHECKLIST_OUTBOX_KEY);
         console.error(
           '[SYNC] Outbox JSON inválido — cópia em',
           backupKey,
           '; chave principal limpa para não bloquear sync (recuperar payload com suporte se necessário).',
           parseErr
         );
       } catch (backupErr) {
         console.error('[SYNC] Outbox corrompida e falha ao gravar backup:', backupErr, parseErr);
       }
       return;
     }

     if (outbox.length === 0) return;

     const gpsAddrFilled = await enrichPendingGpsDerivedAddressesInOutbox(outbox);
     const facialAddrFilled = await enrichFacialBiometricAddressesInOutbox(outbox);
     if (gpsAddrFilled > 0 || facialAddrFilled > 0) {
       await updateStoredJsonArrayWhileLockHeld<any>(
         CHECKLIST_OUTBOX_KEY,
         (current) => {
           const byIdentity = new Map<string, any>();
           for (const item of current) {
             byIdentity.set(checklistOutboxIdentityKey(item), item);
           }
           for (const item of outbox) {
             byIdentity.set(checklistOutboxIdentityKey(item), item);
           }
           return [...byIdentity.values()];
         },
       );
       for (const p of outbox) {
         const tid = checklistOutboxTaskId(p);
         if (tid) {
           try {
             await AsyncStorage.setItem(`@brspark_execution_${tid}`, JSON.stringify(p));
           } catch {
             /* ignore */
           }
         }
       }
       if (gpsAddrFilled > 0) {
         console.log(
           `[SYNC] Moradas (deslocamento / mapa) pendentes enriquecidas na outbox (${gpsAddrFilled}) antes do POST (rede disponível).`
         );
       }
       if (facialAddrFilled > 0) {
         console.log(
           `[SYNC] Moradas faciais (biometria + URI local) enriquecidas na outbox (${facialAddrFilled}) antes do POST.`
         );
       }
     }

     /** Remove da outbox principal: enviado, conflito ou quarentena (cópia fica em conflitos). */
     const outboxRemovalKeys = new Set<string>();
     let postSucceededCount = 0;
     let outboxMetaMutated = false;
     for (const payload of outbox) {
         try {
             const hadSubmissionId = !!parseChecklistSubmissionId(payload);
             ensureChecklistSubmissionId(payload);
             if (!hadSubmissionId) outboxMetaMutated = true;

             const preflight = await preflightChecklistRevisionConflict(payload);
             if (preflight.action === 'drop_as_conflict') {
                 outboxRemovalKeys.add(checklistOutboxIdentityKey(payload));
                 const tid = checklistOutboxTaskId(payload);
                 if (tid) await AsyncStorage.removeItem(`@brspark_execution_${tid}`);
                 continue;
             }

             await uploadLocalMediaInChecklistPayload(payload);
             if (checklistPayloadHasPendingLocalMedia(payload)) {
                 const tid = checklistOutboxTaskId(payload);
                 const identity = checklistOutboxIdentityKey(payload);
                 const pendingCount = checklistPayloadPendingLocalMediaCount(payload);
                 const md = ensureOutboxPayloadMetadata(payload);
                 const prevAttempts = Number(md.__mediaUploadAttempts);
                 const attempts =
                   Number.isFinite(prevAttempts) && prevAttempts >= 0
                     ? Math.floor(prevAttempts) + 1
                     : 1;
                 md.__mediaUploadAttempts = attempts;
                 md.__lastMediaUploadAttemptAt = new Date().toISOString();
                 md.__pendingLocalMediaCount = pendingCount;
                 md.__lastMediaUploadHint = await inferPendingLocalMediaHint(payload);
                 outboxMetaMutated = true;

                 if (attempts >= MEDIA_STUCK_ATTEMPT_THRESHOLD) {
                   await quarantineChecklistOutboxConflict(payload, {
                     reason: 'media_upload_stuck',
                     taskId: tid || undefined,
                     submissionRevision: parseChecklistSubmissionRevision(payload),
                   });
                   outboxRemovalKeys.add(identity);
                 }
                 console.warn(
                   `[SYNC] Upload de mídia incompleto para task=${tid || 'unknown'} (pendentes=${pendingCount}, tentativa=${attempts}); ${
                     attempts >= MEDIA_STUCK_ATTEMPT_THRESHOLD
                       ? 'movido para Conflitos de Sync — reenfileiramento automático no próximo sync com rede.'
                       : 'payload mantido na outbox para nova tentativa.'
                   }`
                 );
                 continue;
             }

             const md = ensureOutboxPayloadMetadata(payload);
             if (
               md.__mediaUploadAttempts != null ||
               md.__lastMediaUploadAttemptAt != null ||
               md.__pendingLocalMediaCount != null ||
               md.__lastMediaUploadHint != null ||
               md.__lastMediaUploadErrorCode != null ||
               md.__lastMediaUploadErrorStatus != null ||
               md.__lastMediaUploadErrorField != null ||
               md.__lastMediaUploadErrorMessage != null ||
               md.__lastMediaUploadErrorAt != null
             ) {
                 delete md.__mediaUploadAttempts;
                 delete md.__lastMediaUploadAttemptAt;
                 delete md.__pendingLocalMediaCount;
                 delete md.__lastMediaUploadHint;
                 delete md.__lastMediaUploadErrorCode;
                 delete md.__lastMediaUploadErrorStatus;
                 delete md.__lastMediaUploadErrorField;
                 delete md.__lastMediaUploadErrorMessage;
                 delete md.__lastMediaUploadErrorAt;
                 outboxMetaMutated = true;
             }

             const res = await apiFetch('/api/checklists/executions', {
                 method: 'POST',
                 body: JSON.stringify(payload),
                 headers: { 'Content-Type': 'application/json' }
             });
             
             if (res.ok || res.status === 409) { // 409 se já foi recebido antes
                 outboxRemovalKeys.add(checklistOutboxIdentityKey(payload));
                 postSucceededCount += 1;
                 // Delete the heavy local payload since it's now archived in the cloud
                 const tid = checklistOutboxTaskId(payload);
                 if (tid) {
                     await AsyncStorage.removeItem(`@brspark_execution_${tid}`);
                 }
             } else if (res.status === 422) {
                 const tid = checklistOutboxTaskId(payload);
                 const localRev = parseChecklistSubmissionRevision(payload);
                 let serverLast: number | null = null;
                 let expectedNext: number | null = null;
                 let shouldDropAsDelivered = false;
                 try {
                     const body = await res.clone().json();
                     if (body?.error === 'revision_mismatch') {
                         const n1 = Number(body?.lastSubmittedRevision);
                         const n2 = Number(body?.expectedNext);
                         serverLast = Number.isFinite(n1) ? n1 : null;
                         expectedNext = Number.isFinite(n2) ? n2 : null;
                         if (
                           serverLast != null &&
                           localRev != null &&
                           serverLast >= localRev &&
                           tid
                         ) {
                           try {
                             const exRes = await apiFetch(`/api/checklists/executions/${tid}`);
                             if (exRes.ok) {
                               const ex = await exRes.json();
                               const st = String(ex?.status || '').toUpperCase();
                               if (TERMINAL_EXEC_CACHE_STATUSES.has(st)) {
                                 shouldDropAsDelivered = true;
                               }
                             }
                           } catch {
                             /* ignore */
                           }
                         }
                     }
                 } catch {
                     /* ignore */
                 }
                 if (shouldDropAsDelivered) {
                     outboxRemovalKeys.add(checklistOutboxIdentityKey(payload));
                     if (tid) await AsyncStorage.removeItem(`@brspark_execution_${tid}`);
                     console.warn(
                       `[SYNC] 422 revision_mismatch tratado como idempotente (task=${tid}). Servidor já terminal.`
                     );
                     continue;
                 }
                 await quarantineChecklistOutboxConflict(payload, {
                     reason: 'server_revision_mismatch',
                     taskId: tid || undefined,
                     submissionRevision: localRev,
                     serverLastSubmittedRevision: serverLast,
                     serverExpectedNext: expectedNext,
                     statusCode: 422,
                 });
                 outboxRemovalKeys.add(checklistOutboxIdentityKey(payload));
                 if (tid) await AsyncStorage.removeItem(`@brspark_execution_${tid}`);
                 console.warn(
                   `[SYNC] Payload movido para conflitos (422 revision_mismatch) task=${tid || 'unknown'}.`
                 );
             } else {
                 console.warn(`[SYNC] Outbox falhou: ${res.status}`);
             }
         } catch (itemErr) {
             console.warn('[SYNC] Outbox item falhou (segue para o próximo):', itemErr);
             continue;
         }
     }
     
     if (outboxMetaMutated) {
         await updateStoredJsonArrayWhileLockHeld<any>(
           CHECKLIST_OUTBOX_KEY,
           (current) => {
             const byIdentity = new Map<string, any>();
             for (const item of current) {
               byIdentity.set(checklistOutboxIdentityKey(item), item);
             }
             for (const item of outbox) {
               byIdentity.set(checklistOutboxIdentityKey(item), item);
             }
             return [...byIdentity.values()];
           }
         );
     }

     if (outboxRemovalKeys.size > 0) {
         const next = await updateStoredJsonArrayWhileLockHeld<any>(
           CHECKLIST_OUTBOX_KEY,
           (current) =>
             current.filter((item) => !outboxRemovalKeys.has(checklistOutboxIdentityKey(item))),
           { removeWhenEmpty: true }
         );
         if (postSucceededCount > 0) {
           console.log(
             `[SYNC] ✅ ${postSucceededCount} tarefa(s) enviada(s) ao servidor. Itens restantes na outbox: ${next.length}`
           );
         }
     }
    });
  } catch (e) {
     console.warn('[SYNC] Erro critico lendo outbox', e);
  }
}

/** Faz push dos dados locais para o servidor */
async function pushModule(endpoint: string, storageKey: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return;
    let data: any[] = [];
    try {
      data = JSON.parse(raw);
      if (!Array.isArray(data)) data = [];
    } catch {
      console.warn(`[SYNC] Dados corrompidos em ${storageKey}, ignorando push.`);
      return;
    }
    if (data.length === 0) return;
    const res = await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      console.warn(
        `[SYNC] Push módulo não-OK (${res.status}) storageKey=${storageKey} endpoint=${endpoint}`,
      );
    }
  } catch (e) {
    console.warn(`[SYNC] Push falhou para ${storageKey}:`, e);
  }
}

/** Faz pull do servidor e merge com dados locais (servidor vence por ID) */
async function pullModule<T>(
  endpoint: string,
  storageKey: string,
  merge?: (remote: T[], local: T[]) => T[]
): Promise<void> {
  try {
    const res = await apiFetch(endpoint);
    if (!res.ok) return;
    const remote: T[] = await res.json();
    if (remote.length === 0 && !merge) return;

    const localRaw = await AsyncStorage.getItem(storageKey);
    let local: T[] = [];
    if (localRaw) {
      try {
        local = JSON.parse(localRaw);
        if (!Array.isArray(local)) local = [];
      } catch {
        console.warn(`[SYNC] Dados locais corrompidos em ${storageKey}. Substituindo pelo remoto.`);
        local = [];
      }
    }

    if (merge) {
      await AsyncStorage.setItem(storageKey, JSON.stringify(merge(remote, local)));
    } else {
      const remoteIds = new Set(remote.map((r: any) => (r as any).id));
      const localOnly = local.filter((l: any) => !remoteIds.has(l.id));
      await AsyncStorage.setItem(storageKey, JSON.stringify([...remote, ...localOnly]));
    }
  } catch (e) {
    console.warn(`[SYNC] Pull falhou para ${storageKey}:`, e);
  }
}

// ── PUSH + PULL por módulo ─────────────────────────────────────────────────────

export async function pullCosts(ownerEmail: string): Promise<void> {
  const q = `?owner_email=${encodeURIComponent(ownerEmail)}`;
  const modules = [
    { path: '/costs/expenses', key: 'costs_expenses' },
    { path: '/costs/recurring', key: 'costs_recurring' },
    { path: '/costs/budgets', key: 'costs_budgets' },
  ];
  await Promise.all(modules.map(m => pushModule(`/api/sync${m.path}${q}`, AuthService.getUserKey(m.key, ownerEmail))));
  await Promise.all(modules.map(m => pullModule(`/api/sync${m.path}${q}`, AuthService.getUserKey(m.key, ownerEmail))));
}

export async function pullInsurance(ownerEmail: string): Promise<void> {
  const q = `?owner_email=${encodeURIComponent(ownerEmail)}`;
  await pushModule(`/api/sync/insurance${q}`, AuthService.getUserKey('insurance_policies', ownerEmail));
  await pullModule(`/api/sync/insurance${q}`, AuthService.getUserKey('insurance_policies', ownerEmail));
}

export async function pullVault(ownerEmail: string): Promise<void> {
  const q = `?owner_email=${encodeURIComponent(ownerEmail)}`;
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const safeEmail = ownerEmail.replace(/[^a-zA-Z0-9]/g, '_');
    const vaultKeys = allKeys.filter(k => k.includes('vault:') && k.includes(safeEmail));
    const entries = await Promise.all(
      vaultKeys.map(async k => {
        const raw = await AsyncStorage.getItem(k);
        const assetId = k.split('vault:').pop() || k;
        let entries = [];
        if (raw) {
          try { entries = JSON.parse(raw); } catch {}
        }
        return { assetId, entries };
      })
    );
    if (entries.length > 0) {
      await apiFetch(`/api/sync/vault${q}`, {
        method: 'POST',
        body: JSON.stringify(entries),
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const res = await apiFetch(`/api/sync/vault${q}`);
    if (!res.ok) return;
    const remoteEntries: Array<{ assetId: string; entries: any[] }> = await res.json();
    await Promise.all(
      remoteEntries.map(({ assetId, entries }) =>
        AsyncStorage.setItem(AuthService.getUserKey(`vault:${assetId}`, ownerEmail), JSON.stringify(entries))
      )
    );
  } catch { /* offline */ }
}

export async function pullMediaMetadata(ownerEmail: string): Promise<void> {
  const q = `?owner_email=${encodeURIComponent(ownerEmail)}`;
  await pushModule(`/api/sync/media${q}`, AuthService.getUserKey('media_remote_index', ownerEmail));
  await pullModule(`/api/sync/media${q}`, AuthService.getUserKey('media_remote_index', ownerEmail));
}

export async function pullAssetDocs(ownerEmail: string): Promise<void> {
  const q = `?owner_email=${encodeURIComponent(ownerEmail)}`;
  await pushModule(`/api/sync/asset_docs${q}`, AuthService.getUserKey('asset_docs', ownerEmail));
  await pullModule(`/api/sync/asset_docs${q}`, AuthService.getUserKey('asset_docs', ownerEmail));
}

export async function pullStock(ownerEmail?: string): Promise<void> {
  const q = ownerEmail ? `?owner_email=${encodeURIComponent(ownerEmail)}` : '';
  try {
    const localItems = getLocalStockItems(ownerEmail);
    if (localItems.length > 0) {
      await apiFetch(`/api/sync/stock/items${q}`, {
        method: 'POST', body: JSON.stringify(localItems), headers: { 'Content-Type': 'application/json' },
      });
    }

    const localMoves = getLocalStockMovements(ownerEmail);
    if (localMoves.length > 0) {
      await apiFetch(`/api/sync/stock/movements${q}`, {
        method: 'POST', body: JSON.stringify(localMoves), headers: { 'Content-Type': 'application/json' },
      });
    }

    const resItems = await apiFetch(`/api/sync/stock/items${q}`);
    if (resItems.ok) {
      const items = await resItems.json();
      items.forEach((it: any) => saveStockItemLocal(it, ownerEmail));
    }
    const resMoves = await apiFetch(`/api/sync/stock/movements${q}`);
    if (resMoves.ok) {
      const moves = await resMoves.json();
      moves.forEach((m: any) => saveStockMovementLocal(m, ownerEmail));
    }
  } catch (e) {
    console.warn('[SYNC] Falha ao sincronizar estoque:', e);
  }
}

export async function pullTechStock(ownerEmail?: string): Promise<void> {
  const q = ownerEmail ? `?owner_email=${encodeURIComponent(ownerEmail)}` : '';
  try {
    const localItems = getLocalTechStockItems(ownerEmail);
    if (localItems.length > 0) {
      await apiFetch(`/api/sync/tech-stock/items${q}`, {
        method: 'POST',
        body: JSON.stringify(localItems),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const localMoves = getLocalTechStockMovements(ownerEmail);
    if (localMoves.length > 0) {
      await apiFetch(`/api/sync/tech-stock/movements${q}`, {
        method: 'POST',
        body: JSON.stringify(localMoves),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const resItems = await apiFetch(`/api/sync/tech-stock/items${q}`);
    if (resItems.ok) {
      const items = await resItems.json();
      items.forEach((it: any) => saveTechStockItemLocal(it, ownerEmail));
    }
    const resMoves = await apiFetch(`/api/sync/tech-stock/movements${q}`);
    if (resMoves.ok) {
      const moves = await resMoves.json();
      moves.forEach((m: any) => saveTechStockMovementLocal(m, ownerEmail));
    }
  } catch (e) {
    console.warn('[SYNC] Falha ao sincronizar estoque do técnico:', e);
  }
}

export async function pullTechFinance(ownerEmail?: string): Promise<void> {
  const q = ownerEmail ? `?owner_email=${encodeURIComponent(ownerEmail)}` : '';
  try {
    let localRows = getLocalTechFinanceEntries(ownerEmail);
    if (ownerEmail && localRows.length > 0) {
      const prepared: any[] = [];
      for (const row of localRows) {
        prepared.push(await ensureTechFinanceAttachmentsUploaded(row, ownerEmail));
      }
      localRows = prepared;
    }
    if (localRows.length > 0) {
      await apiFetch(`/api/sync/tech-finance/entries${q}`, {
        method: 'POST',
        body: JSON.stringify(localRows),
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await apiFetch(`/api/sync/tech-finance/entries${q}`);
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows)) {
        rows.forEach((it: any) => {
          if (!it || !it.id) return;
          saveTechFinanceEntryLocal(
            {
              ...it,
              owner_email: it.owner_email || ownerEmail || null,
            },
            ownerEmail
          );
        });
      }
    }
  } catch (e) {
    console.warn('[SYNC] Falha ao sincronizar financeiro do técnico:', e);
  }
}

export async function pullMaintenances(ownerEmail?: string): Promise<void> {
  const q = ownerEmail ? `?owner_email=${encodeURIComponent(ownerEmail)}` : '';
  const key = ownerEmail ? AuthService.getUserKey('maintenances', ownerEmail) : 'maintenances';
  await pushModule(`/api/sync/maintenances${q}`, key);
  await pullModule(`/api/sync/maintenances${q}`, key);
}

export async function pullAgenda(ownerEmail: string): Promise<void> {
  const q = `?owner_email=${encodeURIComponent(ownerEmail)}`;
  await pushModule(`/api/sync/agenda/events${q}`, AuthService.getUserKey('agenda_events', ownerEmail));
  await pullModule(`/api/sync/agenda/events${q}`, AuthService.getUserKey('agenda_events', ownerEmail));
}

export async function pullAssetNotes(ownerEmail?: string): Promise<void> {
  const q = ownerEmail ? `?owner_email=${encodeURIComponent(ownerEmail)}` : '';
  try {
    const localRows = getLocalAssetNotesForSync(ownerEmail);
    if (ownerEmail && localRows.length > 0) {
      await apiFetch(`/api/sync/asset-notes${q}`, {
        method: 'POST',
        body: JSON.stringify(localRows),
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const res = await apiFetch(`/api/sync/asset-notes${q}`);
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && ownerEmail) {
        for (const it of rows) {
          if (!it?.id || !it?.assetId || it._isShared) continue;
          upsertAssetNoteFromSync(
            {
              id: String(it.id),
              assetId: String(it.assetId),
              title: String(it.title ?? ''),
              content: String(it.content ?? ''),
              createdBy: String(it.createdBy ?? ''),
              createdAt: Number(it.createdAt) || Date.now(),
              updatedAt: Number(it.updatedAt) || Date.now(),
              synced: 1,
            },
            ownerEmail
          );
        }
      }
    }
  } catch (e) {
    console.warn('[SYNC] Falha ao sincronizar notas de ativos:', e);
  }
}

/** metadata vindo como objeto ou string JSON (legado / cópias) */
function parseTaskMetadata(meta: unknown): Record<string, unknown> {
  if (meta == null) return {};
  if (typeof meta === 'string') {
    try {
      const o = JSON.parse(meta);
      return o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof meta === 'object') return meta as Record<string, unknown>;
  return {};
}

function isPausedLikeTask(t: any): boolean {
  const raw = String(t?.status || '').toUpperCase();
  if (raw === 'PAUSED') return true;
  const m = parseTaskMetadata(t?.metadata);
  const ep = m.executionPaused;
  return ep === true || ep === 'true' || String(ep || '').toLowerCase() === 'true';
}

function isResumedLocalSnapshot(t: any): boolean {
  const raw = String(t?.status || '').toUpperCase();
  if (raw !== 'IN_PROGRESS') return false;
  const m = parseTaskMetadata(t?.metadata);
  const ep = m.executionPaused;
  return ep === false || ep === 'false' || String(ep || '').toLowerCase() === 'false';
}

/**
 * Evita apagar pausa/retomada local ao puxar lista: o servidor pode ainda não refletir o último PATCH.
 */
function pickOsNumber(remote: any, prev: any | undefined): string | null | undefined {
  const r = remote?.osNumber != null && String(remote.osNumber).trim() !== '' ? String(remote.osNumber).trim() : null;
  const p = prev?.osNumber != null && String(prev.osNumber).trim() !== '' ? String(prev.osNumber).trim() : null;
  return r ?? p ?? remote?.osNumber ?? prev?.osNumber ?? null;
}

function pickLastSubmittedRevision(remote: any, prev: any | undefined): number {
  const r = Number(remote?.lastSubmittedRevision);
  const p = Number(prev?.lastSubmittedRevision);
  const rn = Number.isFinite(r) ? r : 0;
  const pn = Number.isFinite(p) ? p : 0;
  return Math.max(rn, pn);
}

function remoteHasReopenRevisionPending(rMeta: Record<string, unknown>): boolean {
  return (
    rMeta.reopenForRevisionPending === true ||
    rMeta.reopenForRevisionPending === 'true' ||
    String(rMeta.reopenForRevisionPending || '').toLowerCase() === 'true'
  );
}

function remoteHasRevisionVisitActive(rMeta: Record<string, unknown>): boolean {
  return (
    rMeta.revisionVisitActive === true ||
    rMeta.revisionVisitActive === 'true' ||
    String(rMeta.revisionVisitActive || '').toLowerCase() === 'true'
  );
}

/**
 * O servidor em PENDING (nova despacho ou reabertura) é a verdade — não deixar PATCH antigo
 * IN_PROGRESS/PAUSED na outbox sobrepor o estado ao fazer pull (senão o cartão some da aba Pendentes).
 */
async function stripExecutionStatusOutboxForPendingServerTasks(remoteTasks: any[]): Promise<void> {
  const pendingIds = new Set<string>();
  for (const t of remoteTasks) {
    if (String(t?.status || '').toUpperCase() !== 'PENDING') continue;
    if (t?.id != null) pendingIds.add(String(t.id));
  }
  if (pendingIds.size === 0) return;
  try {
    let removed = 0;
    await updateStoredJsonArray<{ taskId?: string; body?: ExecutionStatusPatchBody }>(
      EXECUTION_STATUS_OUTBOX_KEY,
      (arr) => {
        const next = arr.filter(
          (item) => item?.taskId == null || !pendingIds.has(String(item.taskId))
        );
        removed = arr.length - next.length;
        return next;
      },
      { removeWhenEmpty: true }
    );
    if (removed > 0) {
      console.log(
        `[pullTasks] Outbox de estado da execução limpa para ${removed} OS(s) em PENDING no servidor`
      );
    }
  } catch (e) {
    console.warn('[pullTasks] stripExecutionStatusOutboxForPendingServerTasks:', e);
  }
}

/**
 * Verdade do servidor: OS terminal não pode manter overlay local de execução ativa.
 * Remove resíduos de "em andamento" no aparelho para evitar cartão preso na aba Iniciadas.
 */
async function stripLocalExecutionStateForTerminalServerTasks(remoteTasks: any[]): Promise<void> {
  const terminalIds = new Set<string>();
  for (const t of remoteTasks) {
    const st = String(t?.status || '').toUpperCase();
    if (!TERMINAL_EXEC_CACHE_STATUSES.has(st)) continue;
    if (t?.id != null) terminalIds.add(String(t.id));
  }
  if (terminalIds.size === 0) return;

  try {
    let removed = 0;
    await updateStoredJsonArray<{ taskId?: string; body?: ExecutionStatusPatchBody }>(
      EXECUTION_STATUS_OUTBOX_KEY,
      (arr) => {
        const next = arr.filter((item) => {
          const tid = String(item?.taskId || '').trim();
          return !tid || !terminalIds.has(tid);
        });
        removed = arr.length - next.length;
        return next;
      },
      { removeWhenEmpty: true }
    );
    if (removed > 0) {
      console.log(
        `[pullTasks] Outbox de status limpo para ${removed} item(ns) de OS terminal no servidor`
      );
    }
  } catch (e) {
    console.warn('[pullTasks] stripLocalExecutionStateForTerminalServerTasks (outbox):', e);
  }

  try {
    let removed = 0;
    await updateStoredJsonArray<string>('@brspark_inprogress_tasks', (arr) => {
      const next = arr.filter((id) => !terminalIds.has(String(id)));
      removed = arr.length - next.length;
      return next;
    });
    if (removed > 0) {
      console.log(
        `[pullTasks] @brspark_inprogress_tasks: removidos ${removed} id(s) de OS terminal no servidor`
      );
    }
  } catch (e) {
    console.warn('[pullTasks] stripLocalExecutionStateForTerminalServerTasks (inprogress):', e);
  }
}

/**
 * Se o servidor já concluiu/sincronizou a OS, conflitos locais antigos (ex.: revision_mismatch)
 * deixam de ser úteis e só mantêm a tela presa em "Conflitos de sincronização".
 */
async function clearChecklistQuarantineForTerminalServerTasks(remoteTasks: any[]): Promise<void> {
  const terminalIds = new Set<string>();
  for (const t of remoteTasks) {
    const st = String(t?.status || '').toUpperCase();
    if (!TERMINAL_EXEC_CACHE_STATUSES.has(st)) continue;
    if (t?.id != null) terminalIds.add(String(t.id));
  }
  if (terminalIds.size === 0) return;

  try {
    let removed = 0;
    await updateStoredJsonArray<any>(
      CHECKLIST_OUTBOX_KEY,
      (arr) => {
        const next = arr.filter((item) => {
          const tid = checklistOutboxTaskId(item);
          return !tid || !terminalIds.has(tid);
        });
        removed = arr.length - next.length;
        return next;
      },
      { removeWhenEmpty: true }
    );
    if (removed > 0) {
      console.log(
        `[pullTasks] Outbox de checklist: removidos ${removed} payload(s) de OS terminal no servidor`
      );
    }
  } catch (e) {
    console.warn('[pullTasks] clearChecklistQuarantineForTerminalServerTasks (outbox):', e);
  }

  try {
    const raw = await AsyncStorage.getItem(CHECKLIST_OUTBOX_CONFLICTS_KEY);
    const conflicts = parseChecklistOutboxConflicts(raw);
    if (!Array.isArray(conflicts) || conflicts.length === 0) return;
    const remaining = conflicts.filter((c) => {
      const tid = String(c?.taskId || '').trim();
      return !tid || !terminalIds.has(tid);
    });
    const removed = conflicts.length - remaining.length;
    if (removed <= 0) return;
    if (remaining.length > 0) {
      await AsyncStorage.setItem(CHECKLIST_OUTBOX_CONFLICTS_KEY, JSON.stringify(remaining));
    } else {
      await AsyncStorage.removeItem(CHECKLIST_OUTBOX_CONFLICTS_KEY);
    }
    console.log(
      `[pullTasks] Conflitos em quarentena: removidos ${removed} item(ns) de OS terminal no servidor`
    );
  } catch (e) {
    console.warn('[pullTasks] clearChecklistQuarantineForTerminalServerTasks (conflicts):', e);
  }
}

/** Revisão reaberta pelo admin: tirar id de inprogress local para voltar a Pendentes até novo aceite/início. */
async function stripInProgressLocalForRevisionPendingTasks(remoteTasks: any[]): Promise<void> {
  const ids = new Set<string>();
  for (const t of remoteTasks) {
    const st = String(t?.status || '').toUpperCase();
    if (st !== 'PENDING' && st !== 'RECEIVED') continue;
    if (!metadataIndicatesAdminRevisionCycle(t?.metadata)) continue;
    if (t?.id != null) ids.add(String(t.id));
  }
  if (ids.size === 0) return;
  try {
    let removed = 0;
    await updateStoredJsonArray<string>('@brspark_inprogress_tasks', (arr) => {
      const next = arr.filter((id) => !ids.has(String(id)));
      removed = arr.length - next.length;
      return next;
    });
    if (removed > 0) {
      console.log(`[pullTasks] @brspark_inprogress_tasks: removidos ${removed} id(s) de ciclo de revisão`);
    }
  } catch (e) {
    console.warn('[pullTasks] stripInProgressLocalForRevisionPendingTasks:', e);
  }
}

async function stripRejectedLocalForActiveRemoteTasks(remoteTasks: any[]): Promise<void> {
  const ids = new Set<string>();
  for (const t of remoteTasks) {
    const id = normalizeStoredId(t?.id);
    if (!id || !remoteTaskShouldClearLocalReject(t)) continue;
    ids.add(id);
  }
  if (ids.size === 0) return;
  try {
    let removed = 0;
    await updateStoredJsonArray<string>(REJECTED_TASKS_KEY, (arr) => {
      const next = arr.filter((id) => !ids.has(String(id)));
      removed = arr.length - next.length;
      return next;
    });
    if (removed > 0) {
      console.log(`[pullTasks] ${REJECTED_TASKS_KEY}: removidos ${removed} id(s) ativos devolvidos pelo servidor`);
    }
  } catch (e) {
    console.warn('[pullTasks] stripRejectedLocalForActiveRemoteTasks:', e);
  }
}

/** Não reintroduzir metadados de revisão que o servidor já limpou (após sync / nova conclusão). */
function stripStaleReopenFromMergedMetadata(
  rMeta: Record<string, unknown>,
  merged: Record<string, unknown>
): void {
  if (!remoteHasReopenRevisionPending(rMeta)) delete merged.reopenForRevisionPending;
  if (!remoteHasRevisionVisitActive(rMeta)) delete merged.revisionVisitActive;
}

function pickExpectedFormDurationFromTask(task: any): number | null {
  const v = task?.expectedFormDurationMinutes;
  if (v == null || !Number.isFinite(Number(v)) || Number(v) <= 0) return null;
  return Math.floor(Number(v));
}

/** Preserva ISO não vazio do remoto; se ausente, mantém o anterior (útil entre pulls ou API sem o campo). */
function mergeOptionalTaskIso(remoteVal: unknown, prevVal: unknown): string | null {
  if (remoteVal != null && String(remoteVal).trim() !== '') return String(remoteVal).trim();
  if (prevVal != null && String(prevVal).trim() !== '') return String(prevVal).trim();
  return null;
}

function mergeDurationEtaPreserve(remote: any, prev: any, base: Record<string, unknown>): Record<string, unknown> {
  const expPrev = pickExpectedFormDurationFromTask(prev);
  const expRemote = pickExpectedFormDurationFromTask(remote);
  const etaR = remote?.etaMinutes;
  const etaP = prev?.etaMinutes;
  const hasEtaRemote = etaR != null && Number.isFinite(Number(etaR));
  const hasEtaPrev = etaP != null && Number.isFinite(Number(etaP));
  const startedAt = mergeOptionalTaskIso(remote?.startedAt, prev?.startedAt);
  const completedAt = mergeOptionalTaskIso(remote?.completedAt, prev?.completedAt);
  const plannedFormEndAt = mergeOptionalTaskIso(remote?.plannedFormEndAt, prev?.plannedFormEndAt);
  const agendaEndAt = mergeOptionalTaskIso(remote?.agendaEndAt, prev?.agendaEndAt);
  const agendaStartAt = mergeOptionalTaskIso(remote?.agendaStartAt, prev?.agendaStartAt);
  const scheduledStartAt = mergeOptionalTaskIso(remote?.scheduledStartAt, prev?.scheduledStartAt);
  const urgRemote = remote?.urgente;
  const hasUrgRemote = urgRemote === true || urgRemote === false;
  return {
    ...base,
    ...(expRemote == null && expPrev != null ? { expectedFormDurationMinutes: expPrev } : {}),
    ...(!hasEtaRemote && hasEtaPrev ? { etaMinutes: Math.floor(Number(etaP)) } : {}),
    ...(!hasUrgRemote && prev != null && Object.prototype.hasOwnProperty.call(prev, 'urgente')
      ? { urgente: !!prev.urgente }
      : {}),
    startedAt,
    completedAt,
    plannedFormEndAt,
    agendaEndAt,
    agendaStartAt,
    scheduledStartAt,
  };
}

function mergeRemoteCloudTaskWithPrevious(remote: any, prev: any | undefined): any {
  const rMeta = parseTaskMetadata(remote?.metadata);
  const lsr = pickLastSubmittedRevision(remote, prev);
  if (!prev) {
    return { ...remote, metadata: { ...rMeta }, osNumber: pickOsNumber(remote, prev), lastSubmittedRevision: lsr };
  }
  const pMeta = parseTaskMetadata(prev.metadata);

  if (isResumedLocalSnapshot(prev) && isPausedLikeTask(remote)) {
    const mergedMeta = {
      ...rMeta,
      ...pMeta,
      executionPaused: false,
    };
    stripStaleReopenFromMergedMetadata(rMeta, mergedMeta);
    return mergeDurationEtaPreserve(remote, prev, {
      ...remote,
      osNumber: pickOsNumber(remote, prev),
      lastSubmittedRevision: lsr,
      status: 'IN_PROGRESS',
      metadata: mergedMeta,
    });
  }

  if (isPausedLikeTask(prev) && !isPausedLikeTask(remote)) {
    const rs = String(remote.status || '').toUpperCase();
    if (rs === 'IN_PROGRESS' || rs === 'RECEIVED' || rs === 'PENDING' || rs === 'ACCEPTED') {
      const mergedMeta = {
        ...rMeta,
        executionPaused: true,
        lastPauseAt: pMeta.lastPauseAt ?? rMeta.lastPauseAt,
        lastPauseReasonSummary: pMeta.lastPauseReasonSummary ?? rMeta.lastPauseReasonSummary,
      };
      stripStaleReopenFromMergedMetadata(rMeta, mergedMeta);
      return mergeDurationEtaPreserve(remote, prev, {
        ...remote,
        osNumber: pickOsNumber(remote, prev),
        lastSubmittedRevision: lsr,
        status: 'PAUSED',
        metadata: mergedMeta,
      });
    }
  }

  return mergeDurationEtaPreserve(remote, prev, {
    ...remote,
    metadata: { ...rMeta },
    osNumber: pickOsNumber(remote, prev),
    lastSubmittedRevision: lsr,
  });
}

/** PATCH de execução ainda na fila (offline ou falha): deve vencer sobre o GET /tasks até sincronizar. */
export async function overlayExecutionStatusOutboxOnTasks(tasks: any[]): Promise<any[]> {
  try {
    const pendingChecklistOutboxTaskIds = await getTaskIdsWithPendingChecklistOutbox();
    const raw = await AsyncStorage.getItem(EXECUTION_STATUS_OUTBOX_KEY);
    let arr: { taskId?: string; body?: ExecutionStatusPatchBody }[] = [];
    try {
      arr = raw ? JSON.parse(raw) : [];
    } catch {
      return tasks;
    }
    if (!Array.isArray(arr) || arr.length === 0) return tasks;

    const lastBodyByTask = new Map<string, ExecutionStatusPatchBody>();
    for (const item of arr) {
      if (!item?.taskId || !item.body) continue;
      const st = String(item.body.status || '').toUpperCase();
      if (!st) continue;
      lastBodyByTask.set(String(item.taskId), item.body);
    }
    if (lastBodyByTask.size === 0) return tasks;

    return tasks.map((t) => {
      const body = lastBodyByTask.get(String(t.id));
      if (!body) return t;
      if (pendingChecklistOutboxTaskIds.has(String(t.id))) return t;
      const currentSt = String(t?.status || '').toUpperCase();
      if (TERMINAL_EXEC_CACHE_STATUSES.has(currentSt)) return t;
      const st = String(body.status || '').toUpperCase();
      if (st !== 'PAUSED' && st !== 'IN_PROGRESS') return t;
      const m = parseTaskMetadata(t.metadata);
      const bm = parseTaskMetadata(body.metadata);
      if (st === 'PAUSED') {
        return {
          ...t,
          status: 'PAUSED',
          metadata: { ...m, executionPaused: true, ...bm },
        };
      }
      return {
        ...t,
        status: 'IN_PROGRESS',
        metadata: { ...m, executionPaused: false, ...bm },
      };
    });
  } catch {
    return tasks;
  }
}

/**
 * IDs com último PATCH pendente IN_PROGRESS ou PAUSED (fila offline).
 * Usado no dashboard para não perder a aba "Em andamento" quando o pull ainda não gravou o estado no cache.
 */
export async function getTaskIdsWithPendingExecutionStatusOutbox(): Promise<string[]> {
  try {
    const pendingChecklistOutboxTaskIds = await getTaskIdsWithPendingChecklistOutbox();
    const raw = await AsyncStorage.getItem(EXECUTION_STATUS_OUTBOX_KEY);
    let arr: { taskId?: string; body?: ExecutionStatusPatchBody }[] = [];
    try {
      arr = raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
    if (!Array.isArray(arr) || arr.length === 0) return [];

    let localTerminalIds = new Set<string>();
    try {
      const [ft, rt] = await Promise.all([loadFtCloudTasks(), loadRtCloudTasks()]);
      localTerminalIds = new Set(
        [...ft, ...rt]
          .filter((t: any) => TERMINAL_EXEC_CACHE_STATUSES.has(String(t?.status || '').toUpperCase()))
          .map((t: any) => String(t?.id || '').trim())
          .filter(Boolean)
      );
    } catch {
      localTerminalIds = new Set();
    }

    const lastStatusByTask = new Map<string, string>();
    for (const item of arr) {
      if (!item?.taskId || !item.body) continue;
      const st = String(item.body.status || '').toUpperCase();
      if (st) lastStatusByTask.set(String(item.taskId), st);
    }
    const ids: string[] = [];
    for (const [id, st] of lastStatusByTask) {
      if (pendingChecklistOutboxTaskIds.has(id)) continue;
      if (localTerminalIds.has(id)) continue;
      if (st === 'IN_PROGRESS' || st === 'PAUSED') ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

/**
 * OS com itens na fila que o `pushSyncQueue` envia: `@brspark_outbox`, `@brspark_execution_status_outbox`
 * e payloads em **Conflitos de Sync** (ex.: mídia presa após várias tentativas — ainda não enviados).
 *
 * **Não** inclui `@draft_tsk_*`: rascunho do checklist só sobe após conclusão (entra na outbox);
 * marcar rascunho aqui deixava a nuvem “pendente” para sempre com rede boa, sem sync automático possível.
 */
export async function getTaskIdsWithPendingLocalSyncOverlay(): Promise<Set<string>> {
  const ids = new Set<string>();

  try {
    const outboxRaw = await AsyncStorage.getItem(CHECKLIST_OUTBOX_KEY);
    let outbox: unknown[] = [];
    try {
      outbox = outboxRaw ? JSON.parse(outboxRaw) : [];
    } catch {
      outbox = [];
    }
    if (Array.isArray(outbox)) {
      for (const o of outbox) {
        const tid = checklistOutboxTaskId(o);
        if (tid) ids.add(tid);
      }
    }
  } catch (e) {
    console.warn('[SYNC] getTaskIdsWithPendingLocalSyncOverlay outbox:', e);
  }

  try {
    const raw = await AsyncStorage.getItem(EXECUTION_STATUS_OUTBOX_KEY);
    let arr: { taskId?: string; body?: unknown }[] = [];
    try {
      arr = raw ? JSON.parse(raw) : [];
    } catch {
      arr = [];
    }
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item?.taskId != null && String(item.taskId).trim()) ids.add(String(item.taskId));
      }
    }
  } catch (e) {
    console.warn('[SYNC] getTaskIdsWithPendingLocalSyncOverlay execution status:', e);
  }

  try {
    const conflicts = await getChecklistOutboxConflicts();
    for (const c of conflicts) {
      const tid = taskIdFromChecklistConflictRow(c);
      if (tid) ids.add(tid);
    }
  } catch (e) {
    console.warn('[SYNC] getTaskIdsWithPendingLocalSyncOverlay conflicts:', e);
  }

  return ids;
}

/**
 * OS reaberta para revisão: o mesmo id pode ainda estar em "aceitos" do ciclo anterior.
 * Limpa só accepted_tasks para voltar a exigir "Aceitar".
 *
 * Não limpar @brspark_inprogress_tasks aqui: enquanto reopenForRevisionPending vier do GET
 * (até RECEIVED/ACCEPTED/IN_PROGRESS no servidor), apagar inprogress a cada pullTasks
 * desfaz o "Iniciar" e a OS nunca fica na aba Em andamento.
 * (revisionVisitActive mantém-se na visita; não entra nesta limpeza.)
 */
async function clearLocalAcceptedTasksForRevisionReopen(tasks: any[]): Promise<void> {
  if (!Array.isArray(tasks) || tasks.length === 0) return;
  const idSet = new Set<string>();
  for (const t of tasks) {
    if (t?.id == null) continue;
    const m = parseTaskMetadata(t.metadata);
    const rp =
      m.reopenForRevisionPending === true ||
      m.reopenForRevisionPending === 'true' ||
      String(m.reopenForRevisionPending || '').toLowerCase() === 'true';
    if (rp) idSet.add(String(t.id));
  }
  if (idSet.size === 0) return;
  try {
    let removedIds: string[] = [];
    await updateStoredJsonArray<string>('@brspark_accepted_tasks', (acc) => {
      removedIds = acc.filter((id) => idSet.has(String(id)));
      return acc.filter((id) => !idSet.has(String(id)));
    });
    if (removedIds.length > 0) {
      console.log(`[pullTasks] revisão: removidos de accepted_tasks: ${removedIds.join(', ')}`);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Admin reabriu a OS: tirar o id de @brspark_executed_tasks para o cartão e o checklist voltarem a editáveis.
 *
 * Importante: não limpar só porque o servidor ainda devolveu estado ativo no "tick" seguinte ao push da conclusão;
 * sem sinal explícito de revisão, isso causa efeito "vai para Em andamento e depois volta para Concluídas".
 */
async function removeExecutedCacheEntriesForActiveRemoteTasks(remoteTasks: any[]): Promise<void> {
  if (!Array.isArray(remoteTasks) || remoteTasks.length === 0) return;
  const pendingChecklistOutboxTaskIds = await getTaskIdsWithPendingChecklistOutbox();
  const activeIds = new Set<string>();
  for (const t of remoteTasks) {
    if (!shouldRemoveExecutedCacheForRemoteTask(t, pendingChecklistOutboxTaskIds)) continue;
    activeIds.add(String(t.id));
  }
  if (activeIds.size === 0) return;
  try {
    let removed = 0;
    await updateStoredJsonArray<any>('@brspark_executed_tasks', (arr) => {
      const next = arr.filter((e) => {
        const id = typeof e === 'string' ? e : e?.id;
        if (id == null) return true;
        return !activeIds.has(String(id));
      });
      removed = arr.length - next.length;
      return next;
    });
    if (removed > 0) {
      console.log(`[pullTasks] Cache executed_tasks limpo para ${removed} OS(s) ativas no servidor`);
    }
  } catch {
    /* ignore */
  }
}

export async function pullTasks(ownerEmail?: string): Promise<void> {
  const params = new URLSearchParams();
  if (ownerEmail) params.set('owner_email', ownerEmail);
  /** Evita 304/ETag em endpoint de sync: sem corpo JSON o cache local não recebe OS novas. */
  params.set('_sync_ts', String(Date.now()));
  const q = `?${params.toString()}`;
  console.log(`[pullTasks] 🔄 Iniciando para email: "${ownerEmail}" | URL: /api/sync/tasks${q}`);
  try {
    const res = await apiFetch(`/api/sync/tasks${q}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    console.log(`[pullTasks] HTTP status: ${res.status}`);
    if (res.ok) {
        let syncReason: string | null = null;
        try {
          syncReason = res.headers.get('X-BrSpark-Sync-Tasks-Reason');
        } catch {
          syncReason = null;
        }
        let remoteTasks: any[] = [];
        try {
          const parsed = await res.json();
          remoteTasks = Array.isArray(parsed) ? parsed : [];
        } catch {
          remoteTasks = [];
        }
        /**
         * Sem isto: GET [] com `field-tasks-ineligible` / `no-tenant` gravava `saveFtCloudTasks([])`
         * e apagava todo o cache local — o servidor mantinha RECEIVED de um pull anterior e o painel
         * mentia «Aparelho Recebeu» sem a OS existir no telemóvel.
         */
        if (
          remoteTasks.length === 0 &&
          (syncReason === 'field-tasks-ineligible' || syncReason === 'no-tenant')
        ) {
          if (syncReason === 'field-tasks-ineligible') {
            console.warn(
              '[pullTasks] Lista vazia (inelegível para FT/OS) — cache local preservado. Confirme perfil PROVIDER e o mesmo e-mail do despacho.',
            );
          } else {
            console.warn(
              '[pullTasks] Lista vazia (JWT sem tenantId) — cache local preservado. Verifique sessão / dados de utilizador.',
            );
          }
          return;
        }

        console.log(`[pullTasks] ✅ Recebidas ${remoteTasks.length} OS(s) do servidor`);
        if (remoteTasks.length > 0) {
          console.log(`[pullTasks] Primeira OS: id=${remoteTasks[0].id} | title=${remoteTasks[0].title}`);
        }

        await removeExecutedCacheEntriesForActiveRemoteTasks(remoteTasks);
        await stripExecutionStatusOutboxForPendingServerTasks(remoteTasks);
        await stripLocalExecutionStateForTerminalServerTasks(remoteTasks);
        await clearChecklistQuarantineForTerminalServerTasks(remoteTasks);
        await stripInProgressLocalForRevisionPendingTasks(remoteTasks);
        await stripRejectedLocalForActiveRemoteTasks(remoteTasks);

        let ftExisting = await loadFtCloudTasks();
        let rtExisting = await loadRtCloudTasks();
        /** Migração: RT ainda guardadas no blob FT → bucket RT. */
        const { ft: ftOnly, rt: rtStragglers } = partitionFtRt(ftExisting);
        if (rtStragglers.length > 0) {
          ftExisting = ftOnly;
          const rtById = new Map(rtExisting.map((t: any) => [String(t.id), t]));
          for (const row of rtStragglers) rtById.set(String(row.id), row);
          rtExisting = [...rtById.values()];
          await saveFtCloudTasks(ftExisting);
          await saveRtCloudTasks(rtExisting);
        }
        const existingList = [...ftExisting, ...rtExisting];
        const prevById = new Map(existingList.map((t: any) => [String(t.id), t]));

        const hadPriorTasksPull =
          (await AsyncStorage.getItem('@brspark_pull_tasks_ever')) === '1';

        const remoteFt = remoteTasks.filter((t: any) => !taskRowIsRoutineTask(t));
        const remoteRt = remoteTasks.filter((t: any) => taskRowIsRoutineTask(t));
        const remoteAllIds = new Set(remoteTasks.map((t: any) => String(t?.id || '')));

        const mergedRemoteFt = remoteFt.map((remote: any) =>
          mergeRemoteCloudTaskWithPrevious(remote, prevById.get(String(remote.id)))
        );
        const mergedRemoteRt = remoteRt.map((remote: any) =>
          mergeRemoteCloudTaskWithPrevious(remote, prevById.get(String(remote.id)))
        );

        const carriedRt = rtExisting.filter((t: any) => {
          const rid = String(t?.id || '');
          if (!rid || remoteAllIds.has(rid)) return false;
          const st = String(t?.status || '').toUpperCase();
          if (st === 'CANCELLED' || st === 'CANCELED') return false;
          return true;
        });
        /** Igual ao RT: sem isto, um GET que devolva só parte das OS apaga as outras do AsyncStorage
         *  (painel continua RECEIVED; só uma OS «aparece» no telemóvel). */
        const carriedFt = ftExisting.filter((t: any) => {
          if (taskRowIsRoutineTask(t)) return false;
          const rid = String(t?.id || '');
          if (!rid || remoteAllIds.has(rid)) return false;
          const st = String(t?.status || '').toUpperCase();
          if (st === 'CANCELLED' || st === 'CANCELED') return false;
          return true;
        });

        let processedFt = await overlayExecutionStatusOutboxOnTasks([...carriedFt, ...mergedRemoteFt]);
        let processedRt = await overlayExecutionStatusOutboxOnTasks([...carriedRt, ...mergedRemoteRt]);

        await clearLocalAcceptedTasksForRevisionReopen([...processedFt, ...processedRt]);

        const keepAfterPull = (t: any) => {
          const st = String(t?.status || '').toUpperCase();
          if (st !== 'CANCELLED' && st !== 'CANCELED') return true;
          return !taskRowIsRoutineTask(t);
        };
        processedFt = processedFt.filter(keepAfterPull);
        processedRt = processedRt.filter(keepAfterPull);

        const stampReceived = (t: any) => {
          if (t.metadata && t.metadata.receivedAt) return t;
          return {
            ...t,
            metadata: {
              ...(t.metadata || {}),
              receivedAt: new Date().toISOString(),
            },
          };
        };
        processedFt = processedFt.map(stampReceived);
        processedRt = processedRt.map(stampReceived);

        await saveFtCloudTasks(processedFt);
        await saveRtCloudTasks(processedRt);

        const refIdsForTemplates = new Set<string>();
        for (const t of [...processedFt, ...processedRt]) {
          const rid = taskEffectiveChecklistTemplateId(t);
          if (rid) refIdsForTemplates.add(rid);
        }
        void import('./routineTaskService').then((m) =>
          Promise.allSettled(
            [...refIdsForTemplates].map((rid) => m.cacheChecklistTemplateIfMissing(rid, { timeoutMs: 14_000 }))
          )
        );

        // Notify backend we RECEIVED them — só FT/OS (RT não usa fila «Pendentes» do técnico).
        const unreceived = remoteFt.filter((t: any) => {
          const st = String(t?.status || '').toUpperCase();
          const meta =
            t?.metadata && typeof t.metadata === 'object' && !Array.isArray(t.metadata)
              ? t.metadata
              : {};
          return st === 'PENDING' && !(meta as Record<string, unknown>).receivedAt;
        });
        if (unreceived.length > 0) {
          const recvTs = new Date().toISOString();
          /** Aguardar envio: evita perder RECEIVED se o utilizador fechar o app logo após abrir pelo push. */
          await Promise.allSettled(
            unreceived.map((t: any) =>
              enqueueExecutionStatusPatch(String(t.id), { status: 'RECEIVED', timestamp: recvTs })
            )
          );
        }

        // Igual ao chat: aviso local quando a sync traz OS novas (push remoto do painel é independente).
        if (hadPriorTasksPull) {
          const newTasks = remoteFt.filter((t: any) => {
            const id = String(t.id);
            if (prevById.has(id)) return false;
            const st = String(t.status || '').toUpperCase();
            return st === 'PENDING' || st === 'RECEIVED';
          });
          if (newTasks.length === 1) {
            const t0 = newTasks[0];
            const osTitle = String(t0.title || 'Nova OS').slice(0, 120);
            const m0 = parseTaskMetadata(t0.metadata);
            const formName = String(t0.templateTitle ?? m0.templateTitle ?? '')
              .trim()
              .slice(0, 200);
            Notifications.scheduleNotificationAsync({
              content: {
                title: osTitle,
                body: formName || 'Nova atividade na sua lista.',
                sound: 'default',
              },
              trigger: null,
            }).catch(() => {});
          } else if (newTasks.length > 1) {
            Notifications.scheduleNotificationAsync({
              content: {
                title: 'Novas OS designadas',
                body: `${newTasks.length} novas atividades na sua lista.`,
                sound: 'default',
              },
              trigger: null,
            }).catch(() => {});
          }
        }

        await AsyncStorage.setItem('@brspark_pull_tasks_ever', '1');
        await purgeExpiredCompletedExecutionCaches();
        console.log(`[pullTasks] 💾 Cache FT + RT (buckets separados) atualizado`);
        DeviceEventEmitter.emit(BRSPARK_CLOUD_TASKS_UPDATED);
    } else {
        const err = await res.text();
        console.warn(`[pullTasks] ❌ Servidor retornou ${res.status}: ${err}`);
        // Offline-first: never block the user with an alert
    }
  } catch(e) { 
      console.warn('[pullTasks] ❌ Servidor inalcançável (modo offline):', e);
      // Offline-first: silent fail — data already exists locally
  }
}

// ── Telemetria offline-first ───────────────────────────────────────────────────────

/**
 * Envia o lote de eventos de telemetria armazenados offline.
 * Chamado por pushSyncQueue antes de qualquer outro dado.
 */
export async function pushTelemetryBatch(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(TELEMETRY_OUTBOX_KEY);
    if (!raw) return;
    let events: unknown;
    try {
      events = JSON.parse(raw);
    } catch (parseErr) {
      const backupKey = `${TELEMETRY_OUTBOX_KEY}_invalid_${Date.now()}`;
      try {
        await AsyncStorage.setItem(backupKey, raw);
        await AsyncStorage.removeItem(TELEMETRY_OUTBOX_KEY);
      } catch {
        /* ignore */
      }
      console.warn('[SYNC] Telemetria com JSON inválido foi movida para backup:', parseErr);
      return;
    }
    if (!Array.isArray(events) || events.length === 0) return;

    const BATCH_SIZE = 100;
    let sent = 0;

    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE);
      try {
        const user = await AuthService.getUser().catch(() => null);
        const ownerEmail = user?.email || 'unknown';
        const res = await apiFetch('/api/telemetry/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: batch, ownerEmail }),
        });
        if (res.ok || res.status === 400) {
          // 400 significa batch inválido mas enviado — remove mesmo assim para não travar
          sent += batch.length;
        } else if (res.status >= 500) {
          break; // servidor indisponível — para e tenta depois
        }
      } catch {
        break; // rede caíu — para
      }
    }

    if (sent > 0) {
      const remaining = events.slice(sent);
      await AsyncStorage.setItem(TELEMETRY_OUTBOX_KEY, JSON.stringify(remaining));
      console.log(`[SYNC] 📡 ${sent} eventos de telemetria enviados. Restam: ${remaining.length}`);
    }
  } catch (e) {
    console.warn('[SYNC] Falha ao enviar telemetria:', e);
  }
}

/**
 * Baixa e salva localmente a CollectionPolicy efetiva do tenant.
 */
export async function pullCollectionPolicy(tenantId?: string): Promise<void> {
  try {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    const res = await apiFetch(`/api/collection-policy/effective${qs}`);
    if (res.ok) {
      const policy = await res.json();
      await AsyncStorage.setItem('@brspark_collection_policy', JSON.stringify(policy));
      console.log('[SYNC] ✅ CollectionPolicy atualizada');
    }
  } catch (e) {
    console.warn('[SYNC] Falha ao baixar CollectionPolicy:', e);
  }
}

// ── Full sync (chamado no login + pull-to-refresh) ────────────────────────────

/**
 * Polling: servidor marca OS em tracking sem GPS há 5+ min → notificação local (dedupe por executionId+alertAt).
 */
export async function pollStaleGpsReminders(): Promise<void> {
  try {
    const token = await getToken();
    if (!token) return;
    const res = await apiFetch('/api/telemetry/stale-reminders');
    if (!res.ok) return;
    const data = await res.json();
    const reminders = Array.isArray(data.reminders) ? data.reminders : [];
    for (const r of reminders) {
      if (!r?.executionId || !r?.alertAt) continue;
      const key = `@brspark_stale_gps_shown_${r.executionId}_${r.alertAt}`;
      const already = await AsyncStorage.getItem(key);
      if (already) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Sem sinal de GPS',
          body: r.title
            ? `A OS "${String(r.title).slice(0, 80)}" está sem atualização de localização há vários minutos.`
            : 'Uma OS em deslocamento está sem atualização de GPS.',
        },
        trigger: null,
      });
      await AsyncStorage.setItem(key, '1');
    }
  } catch (e) {
    console.warn('[SYNC] stale-reminders:', e);
  }
}

export async function fullSync(ownerEmail?: string): Promise<void> {
  if (!ownerEmail) return;
  await ensureTechnicianStockLegacyMigration(ownerEmail);
  await pushSyncQueue(ownerEmail); // já inclui pushTelemetryBatch
  await Promise.all([
    pullTasks(ownerEmail),
    pullCollectionPolicy(), // sem tenantId — pega a política global
    pullCosts(ownerEmail),
    pullInsurance(ownerEmail),
    pullStock(ownerEmail),
    pullTechStock(ownerEmail),
    pullTechFinance(ownerEmail),
    pullMaintenances(ownerEmail),
    pullVault(ownerEmail),
    pullMediaMetadata(ownerEmail),
    pullAssetDocs(ownerEmail),
    pullAgenda(ownerEmail),
    pullAssetNotes(ownerEmail),
  ]);
  await pollStaleGpsReminders();
  try {
    await AsyncStorage.setItem(LAST_SUCCESSFUL_FULL_SYNC_AT_MS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export async function getLastSuccessfulFullSyncAtMs(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SUCCESSFUL_FULL_SYNC_AT_MS_KEY);
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Contagens locais para o ecrã Cockpit de sincronização (perfil). */
export async function getLocalSyncHealthSnapshot(ownerEmail?: string): Promise<{
  lastFullSyncAtMs: number | null;
  checklistOutboxCount: number;
  conflictCount: number;
  genericQueueCount: number;
  executionStatusOutboxCount: number;
  telemetryPendingCount: number;
}> {
  const lastFullSyncAtMs = await getLastSuccessfulFullSyncAtMs();
  let checklistOutboxCount = 0;
  try {
    const raw = await AsyncStorage.getItem(CHECKLIST_OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    checklistOutboxCount = Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    checklistOutboxCount = 0;
  }
  const conflictRows = await getChecklistOutboxConflicts();
  const genericQueueCount = getSyncQueue(ownerEmail).length;
  let executionStatusOutboxCount = 0;
  try {
    const raw = await AsyncStorage.getItem(EXECUTION_STATUS_OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    executionStatusOutboxCount = Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    executionStatusOutboxCount = 0;
  }
  let telemetryPendingCount = 0;
  try {
    const raw = await AsyncStorage.getItem(TELEMETRY_OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    telemetryPendingCount = Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    telemetryPendingCount = 0;
  }
  return {
    lastFullSyncAtMs,
    checklistOutboxCount,
    conflictCount: conflictRows.length,
    genericQueueCount,
    executionStatusOutboxCount,
    telemetryPendingCount,
  };
}
