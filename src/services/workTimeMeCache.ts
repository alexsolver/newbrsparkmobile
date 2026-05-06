import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorkTimeMeOk } from './workTimeService';

const WORK_TIME_ME_CACHE_KEY = '@aria_work_time_me_snapshot_v2';
const WORK_TIME_ME_CACHE_KEY_LEGACY_V1 = '@aria_work_time_me_snapshot_v1';
void AsyncStorage.removeItem(WORK_TIME_ME_CACHE_KEY_LEGACY_V1);

export function parseWorkTimeMeCache(raw: string | null): WorkTimeMeOk | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return null;
    const rec = o as Record<string, unknown>;
    if (rec.ok !== true) return null;
    if (typeof rec.userId !== 'string' || typeof rec.tenantId !== 'string') return null;
    if (!rec.settings || typeof rec.settings !== 'object') return null;
    return o as WorkTimeMeOk;
  } catch {
    return null;
  }
}

export async function readWorkTimeMeCacheForUser(session: { id: string; tenantId: string } | null): Promise<WorkTimeMeOk | null> {
  if (!session?.id) return null;
  try {
    const raw = await AsyncStorage.getItem(WORK_TIME_ME_CACHE_KEY);
    const parsed = parseWorkTimeMeCache(raw);
    if (!parsed || parsed.userId !== session.id) return null;
    /* JWT `session.tenantId` e `parsed.tenantId` do /me (tenant efetiva) podem divergir; validar só userId. Online substitui por uma rede fresca. */
    return parsed;
  } catch {
    return null;
  }
}

export async function writeWorkTimeMeCache(eff: WorkTimeMeOk): Promise<void> {
  await AsyncStorage.setItem(WORK_TIME_ME_CACHE_KEY, JSON.stringify(eff));
}

export async function clearWorkTimeMeCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(WORK_TIME_ME_CACHE_KEY);
  } catch {
    /* ignore */
  }
  try {
    const { clearWorkTimePunchesCache } = await import('./workTimePunchesCache');
    await clearWorkTimePunchesCache();
  } catch {
    /* ignore */
  }
}
