/**
 * Fila offline para POST /api/tracking/pause|resume|end — o link do cliente só atualiza no servidor
 * quando a rede voltar; a navegação local do técnico não depende disso.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './auth';

const KEY = '@brspark_tracking_sync_queue';

export type TrackingSyncAction = 'pause' | 'resume' | 'end';

export interface TrackingSyncItem {
  taskId: string;
  action: TrackingSyncAction;
  enqueuedAt: number;
}

export async function enqueueTrackingSync(
  taskId: string,
  action: TrackingSyncAction
): Promise<void> {
  const id = (taskId || '').trim();
  if (!id) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    let q: TrackingSyncItem[] = [];
    if (raw) {
      try {
        const p = JSON.parse(raw);
        q = Array.isArray(p) ? p : [];
      } catch {
        q = [];
      }
    }
    q.push({ taskId: id, action, enqueuedAt: Date.now() });
    await AsyncStorage.setItem(KEY, JSON.stringify(q));
    console.log(`[tracking-sync] enfileirado ${action} → OS ${id}`);
  } catch (e) {
    console.warn('[tracking-sync] enqueue:', e);
  }
}

/** Envia a fila (FIFO). Chamado em cada pushSyncQueue. */
export async function pushTrackingSyncQueue(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    let q: TrackingSyncItem[] = [];
    try {
      const p = JSON.parse(raw);
      q = Array.isArray(p) ? p : [];
    } catch {
      await AsyncStorage.removeItem(KEY);
      return;
    }
    if (q.length === 0) {
      await AsyncStorage.removeItem(KEY);
      return;
    }

    const remaining: TrackingSyncItem[] = [];
    for (const item of q) {
      const tid = (item.taskId || '').trim();
      const act =
        item.action === 'resume'
          ? 'resume'
          : item.action === 'pause'
            ? 'pause'
            : item.action === 'end'
              ? 'end'
              : null;
      if (!tid || !act) continue;
      try {
        const r = await apiFetch(`/api/tracking/${act}/${encodeURIComponent(tid)}`, {
          method: 'POST',
        });
        if (!r.ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }

    if (remaining.length === 0) await AsyncStorage.removeItem(KEY);
    else await AsyncStorage.setItem(KEY, JSON.stringify(remaining));

    if (remaining.length < q.length) {
      console.log(
        `[tracking-sync] ${q.length - remaining.length} enviado(s), ${remaining.length} pendente(s)`
      );
    }
  } catch (e) {
    console.warn('[tracking-sync] push:', e);
  }
}
