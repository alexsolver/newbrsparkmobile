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
import { apiFetch } from './auth';
import { 
  addToSyncQueue, getSyncQueue, clearSyncQueueItem, 
  saveStockItemLocal, saveStockMovementLocal,
  getLocalStockItems, getLocalStockMovements
} from '../database';
import { AuthService } from './auth';
import { uploadFile } from './storageService';

// ── Push fila offline de assets ───────────────────────────────────────────────

let isSyncing = false;

export async function pushSyncQueue(ownerEmail?: string): Promise<void> {
  if (isSyncing) {
    console.log('[SYNC] Sincronização já em andamento, ignorando...');
    return;
  }
  isSyncing = true;
  try {
    // 0. Enviar eventos de telemetria primeiro (dados de coleta)
    await pushTelemetryBatch();

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
             // Intercept responses to upload local media/signatures
             if (payload.responses) {
                 for (const key of Object.keys(payload.responses)) {
                     const val = payload.responses[key];
                     if (typeof val === 'string' && val.startsWith('file://')) {
                         const cleanUri = val.split('?')[0]; // discard queries like ?live=true
                         const ext = cleanUri.split('.').pop() || 'jpg';
                         const emailSafe = (payload.ownerEmail || 'anon').replace(/[^a-zA-Z0-9]/g, '_');
                         // Randomize path so it doesn't overwrite
                         const remotePath = `checklists/${emailSafe}/${payload.taskId || payload.templateId}_${key}_${Date.now()}.${ext}`;
                         try {
                              console.log(`[SYNC] Fazendo upload offline da mídia: ${cleanUri}`);
                              const upRes = await uploadFile(cleanUri, remotePath);
                              if (upRes && upRes.url) {
                                  payload.responses[key] = upRes.url;
                                  console.log(`[SYNC] Mídia substituída por URL remota: ${upRes.url}`);
                              }
                         } catch (e: any) {
                              console.warn(`[SYNC] Falha ao enviar mídia do form offline ${key}:`, e);
                              // se falhar, não jogamos erro na queue inteira para não travar (mas vai falhar embaixo se o backend exigir URL)
                         }
                     }
                 }
             }

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
  } catch (e) { console.warn('[SYNC] Falha ao sincronizar estoque:', e); }
}

export async function pullMaintenances(ownerEmail?: string): Promise<void> {
  const q = ownerEmail ? `?owner_email=${encodeURIComponent(ownerEmail)}` : '';
  const key = ownerEmail ? AuthService.getUserKey('maintenances', ownerEmail) : 'maintenances';
  await pushModule(`/api/sync/maintenances${q}`, key);
  await pullModule(`/api/sync/maintenances${q}`, key);
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
        
        // Add receivedAt timestamp so the server knows when the phone got it
        const processedTasks = remoteTasks.map((t: any) => {
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

export async function fullSync(ownerEmail?: string): Promise<void> {
  if (!ownerEmail) return;
  await pushSyncQueue(ownerEmail); // já inclui pushTelemetryBatch
  await Promise.all([
    pullTasks(ownerEmail),
    pullCollectionPolicy(), // sem tenantId — pega a política global
    pullCosts(ownerEmail),
    pullInsurance(ownerEmail),
    pullStock(ownerEmail),
    pullMaintenances(ownerEmail),
    pullVault(ownerEmail),
    pullMediaMetadata(ownerEmail),
    pullAssetDocs(ownerEmail),
  ]);
}
