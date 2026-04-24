/**
 * Bloqueio global (offline-first) de um único deslocamento operacional por técnico/aparelho.
 * Evita iniciar «Iniciar deslocamento» noutra OS enquanto uma ficou com transit_start sem transit_end.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const OPERATIONAL_TRANSIT_LOCK_STORAGE_KEY = '@brspark_active_operational_transit_v1';

export type OperationalTransitLockPayload = { taskId: string };

export async function getOperationalTransitLock(): Promise<OperationalTransitLockPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(OPERATIONAL_TRANSIT_LOCK_STORAGE_KEY);
    if (!raw || !String(raw).trim()) return null;
    const j = JSON.parse(raw) as { taskId?: unknown };
    const taskId = typeof j?.taskId === 'string' ? j.taskId.trim() : '';
    if (!taskId) return null;
    return { taskId };
  } catch {
    return null;
  }
}

export async function setOperationalTransitLock(taskId: string): Promise<void> {
  const tid = String(taskId || '').trim();
  if (!tid) return;
  await AsyncStorage.setItem(OPERATIONAL_TRANSIT_LOCK_STORAGE_KEY, JSON.stringify({ taskId: tid }));
}

/** Remove o lock só se for da execução indicada (evita apagar lock de outra OS). */
export async function clearOperationalTransitLockForTask(taskId: string): Promise<void> {
  const tid = String(taskId || '').trim();
  if (!tid) return;
  const cur = await getOperationalTransitLock();
  if (cur?.taskId === tid) {
    await AsyncStorage.removeItem(OPERATIONAL_TRANSIT_LOCK_STORAGE_KEY);
  }
}
