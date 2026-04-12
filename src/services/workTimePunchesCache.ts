import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorkTimePunchRow } from './workTimeService';

const KEY = '@brspark_work_time_punches_snapshot_v1';
const MAX_ROWS = 400;

type Snapshot = {
  userId: string;
  tenantId: string;
  rows: WorkTimePunchRow[];
};

function parseSnapshot(raw: string | null): Snapshot | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return null;
    const rec = o as Record<string, unknown>;
    if (typeof rec.userId !== 'string' || typeof rec.tenantId !== 'string') return null;
    if (!Array.isArray(rec.rows)) return null;
    return o as Snapshot;
  } catch {
    return null;
  }
}

export async function readWorkTimePunchesCacheForUser(session: { id: string; tenantId: string } | null): Promise<WorkTimePunchRow[]> {
  if (!session?.id) return [];
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const s = parseSnapshot(raw);
    if (!s || s.userId !== session.id || s.tenantId !== session.tenantId) return [];
    return Array.isArray(s.rows) ? s.rows : [];
  } catch {
    return [];
  }
}

export async function writeWorkTimePunchesCache(session: { id: string; tenantId: string } | null, rows: WorkTimePunchRow[]): Promise<void> {
  if (!session?.id) return;
  try {
    const snap: Snapshot = {
      userId: session.id,
      tenantId: session.tenantId,
      rows: rows.slice(0, MAX_ROWS),
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    /* best-effort */
  }
}

export async function clearWorkTimePunchesCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Junta fila pendente + servidor (ou cache), ordenado por data descendente — alinhado ao ecrã de ponto. */
export function mergePendingWithServerPunches(pending: WorkTimePunchRow[], server: WorkTimePunchRow[]): WorkTimePunchRow[] {
  return [...pending, ...server].sort(
    (a, b) => new Date(b.deviceTimestamp).getTime() - new Date(a.deviceTimestamp).getTime()
  );
}
