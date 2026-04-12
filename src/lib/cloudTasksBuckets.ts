/**
 * Cache local de execuções: FT/OS (`@brspark_cloud_tasks`) vs RT (`@brspark_rt_cloud_tasks`).
 * RT não entra na lista «Pendentes» do prestador — só fila/cache para abertura pelo menu radial.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { taskRowIsRoutineTask } from './routineTaskQueueUi';

export const FTS_CLOUD_TASKS_KEY = '@brspark_cloud_tasks';
export const RT_CLOUD_TASKS_KEY = '@brspark_rt_cloud_tasks';

function parseArr(raw: string | null): any[] {
  try {
    const j = raw ? JSON.parse(raw) : [];
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

export async function loadFtCloudTasks(): Promise<any[]> {
  return parseArr(await AsyncStorage.getItem(FTS_CLOUD_TASKS_KEY));
}

export async function loadRtCloudTasks(): Promise<any[]> {
  return parseArr(await AsyncStorage.getItem(RT_CLOUD_TASKS_KEY));
}

/** Checklist / lookup por id — procura em RT e FT. */
export async function loadAllCloudTasksForExecutionLookup(): Promise<any[]> {
  const [ft, rt] = await Promise.all([loadFtCloudTasks(), loadRtCloudTasks()]);
  return [...rt, ...ft];
}

export async function saveFtCloudTasks(rows: any[]): Promise<void> {
  await AsyncStorage.setItem(FTS_CLOUD_TASKS_KEY, JSON.stringify(rows));
}

export async function saveRtCloudTasks(rows: any[]): Promise<void> {
  await AsyncStorage.setItem(RT_CLOUD_TASKS_KEY, JSON.stringify(rows));
}

export function partitionFtRt(rows: any[]): { ft: any[]; rt: any[] } {
  const ft: any[] = [];
  const rt: any[] = [];
  for (const t of rows) {
    if (taskRowIsRoutineTask(t)) rt.push(t);
    else ft.push(t);
  }
  return { ft, rt };
}

export async function savePartitionedFromUnifiedList(rows: any[]): Promise<void> {
  const { ft, rt } = partitionFtRt(rows);
  await saveFtCloudTasks(ft);
  await saveRtCloudTasks(rt);
}

export async function findCloudTaskById(taskId: string): Promise<any | null> {
  const id = String(taskId || '');
  if (!id) return null;
  const all = await loadAllCloudTasksForExecutionLookup();
  return all.find((t) => String(t.id) === id) || null;
}

/**
 * Atualiza uma linha no bucket onde o id já existe; caso contrário insere no bucket inferido pela linha.
 */
export async function patchCloudTaskById(taskId: string, patch: (row: any) => any): Promise<boolean> {
  const id = String(taskId || '');
  if (!id) return false;
  const ft = await loadFtCloudTasks();
  const rt = await loadRtCloudTasks();
  const iR = rt.findIndex((t) => String(t.id) === id);
  if (iR >= 0) {
    rt[iR] = patch(rt[iR]);
    await saveRtCloudTasks(rt);
    return true;
  }
  const iF = ft.findIndex((t) => String(t.id) === id);
  if (iF >= 0) {
    ft[iF] = patch(ft[iF]);
    await saveFtCloudTasks(ft);
    return true;
  }
  return false;
}

export async function upsertCloudExecutionRow(row: any): Promise<void> {
  const id = String(row?.id || '');
  if (!id) return;
  let ft = await loadFtCloudTasks();
  let rt = await loadRtCloudTasks();
  const iF = ft.findIndex((t) => String(t.id) === id);
  const iR = rt.findIndex((t) => String(t.id) === id);
  if (iR >= 0) {
    rt[iR] = { ...rt[iR], ...row };
    if (iF >= 0) ft = ft.filter((t) => String(t.id) !== id);
    await saveRtCloudTasks(rt);
    await saveFtCloudTasks(ft);
    return;
  }
  if (iF >= 0) {
    ft[iF] = { ...ft[iF], ...row };
    await saveFtCloudTasks(ft);
    await saveRtCloudTasks(rt);
    return;
  }
  if (taskRowIsRoutineTask(row)) {
    rt.unshift(row);
    await saveRtCloudTasks(rt);
    await saveFtCloudTasks(ft);
  } else {
    ft.unshift(row);
    await saveFtCloudTasks(ft);
    await saveRtCloudTasks(rt);
  }
}
