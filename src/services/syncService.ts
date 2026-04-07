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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system/legacy';
import { apiFetch, getToken } from './auth';
import { 
  addToSyncQueue, getSyncQueue, clearSyncQueueItem, 
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
} from '../database';
import { AuthService } from './auth';
import { ensureTechnicianStockLegacyMigration } from './technicianStockMigration';
import { uploadFile } from './storageService';
import { pushTrackingSyncQueue } from './trackingSyncQueue';

// ── Push fila offline de assets ───────────────────────────────────────────────

let isSyncing = false;

const EXECUTION_STATUS_OUTBOX_KEY = '@brspark_execution_status_outbox';

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
    const raw = await AsyncStorage.getItem(EXECUTION_STATUS_OUTBOX_KEY);
    let arr: unknown[] = [];
    try {
      arr = raw ? JSON.parse(raw) : [];
    } catch {
      arr = [];
    }
    if (!Array.isArray(arr)) arr = [];
    arr.push({ taskId, body, queuedAt: Date.now() });
    await AsyncStorage.setItem(EXECUTION_STATUS_OUTBOX_KEY, JSON.stringify(arr));
  } catch (e) {
    console.warn('[SYNC] Falha ao enfileirar PATCH de estado da OS:', e);
  }
}

async function pushExecutionStatusOutbox(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(EXECUTION_STATUS_OUTBOX_KEY);
    if (!raw) return;
    let arr: { taskId: string; body: ExecutionStatusPatchBody }[] = [];
    try {
      arr = JSON.parse(raw);
    } catch {
      await AsyncStorage.removeItem(EXECUTION_STATUS_OUTBOX_KEY);
      return;
    }
    if (!Array.isArray(arr) || arr.length === 0) return;

    const remaining: typeof arr = [];
    for (const item of arr) {
      if (!item?.taskId || !item.body) continue;
      try {
        const res = await apiFetch(`/api/checklists/executions/${item.taskId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.body),
        });
        if (!res.ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    if (remaining.length === 0) {
      await AsyncStorage.removeItem(EXECUTION_STATUS_OUTBOX_KEY);
    } else {
      await AsyncStorage.setItem(EXECUTION_STATUS_OUTBOX_KEY, JSON.stringify(remaining));
    }
  } catch (e) {
    console.warn('[SYNC] pushExecutionStatusOutbox:', e);
  }
}

export async function pushSyncQueue(ownerEmail?: string): Promise<void> {
  if (isSyncing) {
    console.log('[SYNC] Sincronização já em andamento, ignorando...');
    return;
  }
  isSyncing = true;
  try {
    // 0. Enviar eventos de telemetria primeiro (dados de coleta)
    await pushTelemetryBatch();

    // 0b. Pausa/retomada do link público (enfileirado offline no mapa ao vivo)
    await pushTrackingSyncQueue();

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
      }
    } catch (e) {
      console.warn('[SYNC] Falha de conexão durante o push genérico.', e);
    }
  } finally {
    isSyncing = false;
  }
}

// ── Helpers genéricos ─────────────────────────────────────────────────────────

/** URIs locais que precisam de upload antes do POST da execução (não enviar file:// / content:// ao servidor). */
function isLocalMediaUri(val: unknown): val is string {
  if (typeof val !== 'string' || !val.trim()) return false;
  const base = val.split('?')[0].trim().toLowerCase();
  if (base.startsWith('http://') || base.startsWith('https://')) return false;
  if (base.startsWith('file://')) return true;
  if (base.startsWith('content://')) return true;
  if (base.startsWith('ph://') || base.startsWith('assets-library://')) return true;
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

async function uploadOneLocalMediaField(
  localUriWithMaybeQuery: string,
  payload: { taskId?: string; templateId?: string; ownerEmail?: string },
  fieldKey: string,
  indexSuffix: string
): Promise<string | null> {
  const emailSafe = (payload.ownerEmail || 'anon').replace(/[^a-zA-Z0-9]/g, '_');
  const readable = await ensureUploadableFileUri(localUriWithMaybeQuery);
  const ext = guessExtFromUri(readable) || 'jpg';
  const remotePath = `checklists/${emailSafe}/${payload.taskId || payload.templateId}_${fieldKey}${indexSuffix}_${Date.now()}.${ext}`;
  console.log(`[SYNC] Upload mídia checklist: ${readable.slice(0, 80)}… → ${remotePath}`);
  const upRes = await uploadFile(readable, remotePath);
  return upRes?.url || null;
}

/** Substitui file:// / content:// / arrays de URIs por URLs públicas antes de POST /executions. */
async function uploadLocalMediaInChecklistPayload(payload: any): Promise<void> {
  if (!payload?.responses || typeof payload.responses !== 'object') return;
  const responses = payload.responses as Record<string, unknown>;

  for (const key of Object.keys(responses)) {
    if (key.startsWith('__')) continue;

    const val = responses[key];

    if (typeof val === 'string' && isLocalMediaUri(val)) {
      try {
        const url = await uploadOneLocalMediaField(val, payload, key, '');
        if (url) {
          responses[key] = url;
          console.log(`[SYNC] Campo ${key} → URL remota`);
        }
      } catch (e: any) {
        console.warn(`[SYNC] Falha upload mídia campo ${key}:`, e?.message || e);
      }
      continue;
    }

    if (Array.isArray(val)) {
      let anyChange = false;
      const next: unknown[] = [];
      for (let i = 0; i < val.length; i++) {
        const item = val[i];
        if (typeof item === 'string' && isLocalMediaUri(item)) {
          try {
            const url = await uploadOneLocalMediaField(item, payload, key, `_i${i}`);
            if (url) {
              next.push(url);
              anyChange = true;
              continue;
            }
          } catch (e: any) {
            console.warn(`[SYNC] Falha upload mídia ${key}[${i}]:`, e?.message || e);
          }
        }
        next.push(item);
      }
      if (anyChange) responses[key] = next;
    }
  }
}

async function pushChecklistOutbox() {
  try {
     const raw = await AsyncStorage.getItem('@brspark_outbox');
     if (!raw) return;
     let outbox: any[] = [];
     try {
       outbox = JSON.parse(raw);
       if (!Array.isArray(outbox)) outbox = [];
     } catch (parseErr) {
       console.warn('[SYNC] Outbox corrompida, limpando para desbloquear fila...', parseErr);
       await AsyncStorage.removeItem('@brspark_outbox');
       return;
     }

     if (outbox.length === 0) return;

     const syncedIds: any[] = [];
     for (const payload of outbox) {
         try {
             await uploadLocalMediaInChecklistPayload(payload);

             const res = await apiFetch('/api/checklists/executions', {
                 method: 'POST',
                 body: JSON.stringify(payload),
                 headers: { 'Content-Type': 'application/json' }
             });
             
             if (res.ok || res.status === 409) { // 409 se já foi recebido antes
                 syncedIds.push(payload.taskId || payload.templateId);
                 // Delete the heavy local payload since it's now archived in the cloud
                 if (payload.taskId) {
                     await AsyncStorage.removeItem(`@brspark_execution_${payload.taskId}`);
                 }
             } else {
                 console.warn(`[SYNC] Outbox falhou: ${res.status}`);
             }
         } catch (netErr) {
             console.warn('[SYNC] Outbox rede falhou (offline)', netErr);
             break; // Pare de tentar se a rede caiu
         }
     }
     
     if (syncedIds.length > 0) {
         const newOutbox = outbox.filter((item: any) => !syncedIds.includes(item.taskId || item.templateId));
         await AsyncStorage.setItem('@brspark_outbox', JSON.stringify(newOutbox));
         console.log(`[SYNC] ✅ ${syncedIds.length} tarefas sincronizadas (concluídas). Faltam: ${newOutbox.length}`);
     }
  } catch (e) {
     console.warn('[SYNC] Erro critico lendo outbox', e);
  }
}

// ── Helpers genéricos ─────────────────────────────────────────────────────────

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
    await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    });
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
    const localRows = getLocalTechFinanceEntries(ownerEmail);
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

/** Não reintroduzir metadados de revisão que o servidor já limpou (após sync / nova conclusão). */
function stripStaleReopenFromMergedMetadata(
  rMeta: Record<string, unknown>,
  merged: Record<string, unknown>
): void {
  if (!remoteHasReopenRevisionPending(rMeta)) delete merged.reopenForRevisionPending;
  if (!remoteHasRevisionVisitActive(rMeta)) delete merged.revisionVisitActive;
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
    return {
      ...remote,
      osNumber: pickOsNumber(remote, prev),
      lastSubmittedRevision: lsr,
      status: 'IN_PROGRESS',
      metadata: mergedMeta,
    };
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
      return {
        ...remote,
        osNumber: pickOsNumber(remote, prev),
        lastSubmittedRevision: lsr,
        status: 'PAUSED',
        metadata: mergedMeta,
      };
    }
  }

  return {
    ...remote,
    metadata: { ...rMeta },
    osNumber: pickOsNumber(remote, prev),
    lastSubmittedRevision: lsr,
  };
}

/** PATCH de execução ainda na fila (offline ou falha): deve vencer sobre o GET /tasks até sincronizar. */
async function overlayExecutionStatusOutboxOnTasks(tasks: any[]): Promise<any[]> {
  try {
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

const ACTIVE_TASK_STATUSES = new Set(['PENDING', 'RECEIVED', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED']);

/**
 * OS reaberta para revisão: o mesmo id pode ainda estar em «aceites» do ciclo anterior.
 * Limpa só accepted_tasks para voltar a exigir «Aceitar».
 *
 * Não limpar @brspark_inprogress_tasks aqui: enquanto reopenForRevisionPending vier do GET
 * (até RECEIVED/ACCEPTED/IN_PROGRESS no servidor), apagar inprogress a cada pullTasks
 * desfaz o «Iniciar» e a OS nunca fica na aba Em andamento.
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
    const accRaw = await AsyncStorage.getItem('@brspark_accepted_tasks');
    let acc: string[] = [];
    try {
      acc = accRaw ? JSON.parse(accRaw) : [];
    } catch {
      acc = [];
    }
    if (!Array.isArray(acc)) acc = [];
    const accNext = acc.filter((id) => !idSet.has(String(id)));
    if (accNext.length !== acc.length) {
      const removed = acc.filter((id) => idSet.has(String(id)));
      await AsyncStorage.setItem('@brspark_accepted_tasks', JSON.stringify(accNext));
      console.log(`[pullTasks] revisão: removidos de accepted_tasks: ${removed.join(', ')}`);
    }
  } catch {
    /* ignore */
  }
}

/** Admin reabriu a OS: tirar o id de @brspark_executed_tasks para o cartão e o checklist voltarem a editáveis. */
async function removeExecutedCacheEntriesForActiveRemoteTasks(remoteTasks: any[]): Promise<void> {
  if (!Array.isArray(remoteTasks) || remoteTasks.length === 0) return;
  const activeIds = new Set<string>();
  for (const t of remoteTasks) {
    const st = String(t?.status || '').toUpperCase();
    if (ACTIVE_TASK_STATUSES.has(st) && t?.id != null) activeIds.add(String(t.id));
  }
  if (activeIds.size === 0) return;
  try {
    const raw = await AsyncStorage.getItem('@brspark_executed_tasks') || '[]';
    let arr: any[] = [];
    try {
      arr = raw ? JSON.parse(raw) : [];
    } catch {
      return;
    }
    if (!Array.isArray(arr) || arr.length === 0) return;
    const next = arr.filter((e) => {
      const id = typeof e === 'string' ? e : e?.id;
      if (id == null) return true;
      return !activeIds.has(String(id));
    });
    if (next.length !== arr.length) {
      await AsyncStorage.setItem('@brspark_executed_tasks', JSON.stringify(next));
      console.log(`[pullTasks] Cache executed_tasks limpo para ${arr.length - next.length} OS(s) activas no servidor`);
    }
  } catch {
    /* ignore */
  }
}

export async function pullTasks(ownerEmail?: string): Promise<void> {
  const q = ownerEmail ? `?owner_email=${encodeURIComponent(ownerEmail)}` : '';
  console.log(`[pullTasks] 🔄 Iniciando para email: "${ownerEmail}" | URL: /api/sync/tasks${q}`);
  try {
    const res = await apiFetch(`/api/sync/tasks${q}`);
    console.log(`[pullTasks] HTTP status: ${res.status}`);
    if (res.ok) {
        const remoteTasks = await res.json();
        console.log(`[pullTasks] ✅ Recebidas ${remoteTasks.length} OS(s) do servidor`);
        if (remoteTasks.length > 0) {
          console.log(`[pullTasks] Primeira OS: id=${remoteTasks[0].id} | title=${remoteTasks[0].title}`);
        }

        await removeExecutedCacheEntriesForActiveRemoteTasks(remoteTasks);

        let existingList: any[] = [];
        try {
          const exRaw = await AsyncStorage.getItem('@brspark_cloud_tasks');
          const ex = exRaw ? JSON.parse(exRaw) : [];
          existingList = Array.isArray(ex) ? ex : [];
        } catch {
          existingList = [];
        }
        const prevById = new Map(existingList.map((t: any) => [String(t.id), t]));

        const hadPriorTasksPull =
          (await AsyncStorage.getItem('@brspark_pull_tasks_ever')) === '1';

        const mergedRemote = remoteTasks.map((remote: any) =>
          mergeRemoteCloudTaskWithPrevious(remote, prevById.get(String(remote.id)))
        );

        let processedTasks = await overlayExecutionStatusOutboxOnTasks(mergedRemote);

        await clearLocalAcceptedTasksForRevisionReopen(processedTasks);

        // Add receivedAt timestamp so the server knows when the phone got it
        processedTasks = processedTasks.map((t: any) => {
            if (t.metadata && t.metadata.receivedAt) return t; // Already has it
            return {
                ...t,
                metadata: {
                    ...(t.metadata || {}),
                    receivedAt: new Date().toISOString()
                }
            };
        });
        
        await AsyncStorage.setItem('@brspark_cloud_tasks', JSON.stringify(processedTasks));
        
        // Notify backend we RECEIVED them (sends ping to Kanban that it arrived at the phone: Aguardando Aceite)
        const unreceived = remoteTasks.filter((t: any) => t.status === 'PENDING' && !t.metadata?.receivedAt);
        if (unreceived.length > 0) {
            Promise.all(unreceived.map((t: any) => apiFetch(`/api/checklists/executions/${t.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'RECEIVED', timestamp: new Date().toISOString() })
            }))).catch(() => {});
        }

        // Igual ao chat: aviso local quando a sync traz OS novas (push remoto do painel é independente).
        if (hadPriorTasksPull) {
          const newTasks = remoteTasks.filter((t: any) => {
            const id = String(t.id);
            if (prevById.has(id)) return false;
            const st = String(t.status || '').toUpperCase();
            return st === 'PENDING' || st === 'RECEIVED';
          });
          if (newTasks.length === 1) {
            const ttl = String(newTasks[0].title || 'Nova OS').slice(0, 120);
            Notifications.scheduleNotificationAsync({
              content: { title: 'Nova OS designada', body: ttl, sound: 'default' },
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
        console.log(`[pullTasks] 💾 Cache @brspark_cloud_tasks atualizado`);
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

// ── Enqueue mutations ─────────────────────────────────────────────────────────

export function enqueueMutation(module: string, action: string, payload: object, ownerEmail?: string): void {
  addToSyncQueue(module, action, payload, ownerEmail);
}

// ── Telemetria offline-first ───────────────────────────────────────────────────────

/**
 * Envia o lote de eventos de telemetria armazenados offline.
 * Chamado por pushSyncQueue antes de qualquer outro dado.
 */
export async function pushTelemetryBatch(): Promise<void> {
  const TELEMETRY_KEY = '@brspark_telemetry_outbox';
  try {
    const raw = await AsyncStorage.getItem(TELEMETRY_KEY);
    if (!raw) return;
    const events = JSON.parse(raw);
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
      await AsyncStorage.setItem(TELEMETRY_KEY, JSON.stringify(remaining));
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
            ? `A OS «${String(r.title).slice(0, 80)}» está sem atualização de localização há vários minutos.`
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
  ]);
  await pollStaleGpsReminders();
}
