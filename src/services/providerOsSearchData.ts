/**
 * Carrega o mesmo conjunto de OS do prestador que o dashboard (agenda + injetadas + estados locais)
 * e monta um índice de texto para busca (metadados + rascunhos + respostas em cache do checklist).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MEDIA_TAG_COLORS } from '../theme/colors';
import { taskOsLabel } from '../utils/taskOsLabel';
import { effectiveProviderTaskStatus } from '../utils/technicianFinanceLinkableTasks';
import {
  pullTasks,
  purgeExpiredCompletedExecutionCaches,
  getTaskIdsWithPendingExecutionStatusOutbox,
  getTaskIdsWithPendingLocalSyncOverlay,
  COMPLETED_BODY_LOCAL_TTL_MS,
} from './syncService';
import { AgendaService } from './agendaService';

function taskMetadataRecord(t: any): Record<string, unknown> {
  const m = t?.metadata;
  if (m == null) return {};
  if (typeof m === 'string') {
    try {
      const o = JSON.parse(m);
      return o && typeof o === 'object' ? o : {};
    } catch {
      return {};
    }
  }
  if (typeof m === 'object') return m as Record<string, unknown>;
  return {};
}

function parseCoordLatLng(t: any): { lat: number; lng: number } | null {
  const rawLat = t?.locationLat ?? t?.metadata?.locationLat ?? t?.metadata?.lat;
  const rawLng = t?.locationLng ?? t?.metadata?.locationLng ?? t?.metadata?.lng;
  const lat =
    typeof rawLat === 'number' && Number.isFinite(rawLat)
      ? rawLat
      : parseFloat(String(rawLat ?? '').trim().replace(',', '.'));
  const lng =
    typeof rawLng === 'number' && Number.isFinite(rawLng)
      ? rawLng
      : parseFloat(String(rawLng ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function ymdLocalNoonToIsoUtc(ymd: string | undefined | null): string | null {
  if (ymd == null || String(ymd).trim() === '') return null;
  const s = String(ymd).trim();
  if (s.includes('T')) return s;
  return `${s}T12:00:00.000Z`;
}

function parseIsoToMs(iso: string | null | undefined): number {
  if (iso == null || String(iso).trim() === '') return 0;
  const t = new Date(String(iso).trim()).getTime();
  return Number.isFinite(t) ? t : 0;
}

function providerTaskDueIsoForSort(t: any): string | null {
  const ag = t?.agendaEndAt ?? t?.plannedFormEndAt;
  if (ag != null && String(ag).trim() !== '') return String(ag).trim();
  const meta = taskMetadataRecord(t);
  if (meta.dueDate != null && String(meta.dueDate).trim() !== '') return String(meta.dueDate).trim();
  if (t?.endDate != null && String(t.endDate).trim() !== '') return String(t.endDate).trim();
  return null;
}

function providerTaskDeviceReceivedAtIso(t: any): string | null {
  const meta = taskMetadataRecord(t);
  for (const k of ['receivedAt', 'syncedAt'] as const) {
    const v = meta[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

function flattenUnknownToSearchText(v: unknown, depth = 0): string {
  if (depth > 14) return '';
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return ` ${String(v)}`;
  if (Array.isArray(v)) return v.map((x) => flattenUnknownToSearchText(x, depth + 1)).join(' ');
  if (typeof v === 'object') {
    return Object.values(v as object)
      .map((x) => flattenUnknownToSearchText(x, depth + 1))
      .join(' ');
  }
  return '';
}

export type ProviderOsSearchRow = {
  id: string;
  statusEff: string;
  title: string;
  serviceTitle: string;
  osNumber: string | null;
  description: string;
  locationAddress: string | null;
  refId: string | null;
  formTemplateTitle: string | null;
  icon: string | null;
  /** Ordem / agenda (startDate). */
  startMs: number;
  /** Recebimento no aparelho (metadata). */
  receivedMs: number;
  /** Prazo / fim previsto formulário. */
  dueMs: number;
  /** Criação da execução / OS. */
  createdMs: number;
  searchIndex: string;
  raw: any;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function enrichSearchIndexFromLocalStores(rows: ProviderOsSearchRow[]): Promise<void> {
  const keys: string[] = [];
  for (const r of rows) {
    keys.push(`@brspark_execution_${r.id}`);
    keys.push(`@draft_tsk_${r.id}`);
  }
  const extraById: Record<string, string> = {};
  for (const part of chunk(keys, 80)) {
    const pairs = await AsyncStorage.multiGet(part);
    for (const [k, v] of pairs) {
      if (!v) continue;
      const id = k.startsWith('@brspark_execution_')
        ? k.slice('@brspark_execution_'.length)
        : k.startsWith('@draft_tsk_')
          ? k.slice('@draft_tsk_'.length)
          : '';
      if (!id) continue;
      try {
        const o = JSON.parse(v);
        let blob = '';
        if (k.startsWith('@brspark_execution_')) {
          blob +=
            flattenUnknownToSearchText(o?.responses) +
            flattenUnknownToSearchText(o?.metadata) +
            flattenUnknownToSearchText(o?.notes) +
            flattenUnknownToSearchText(o?.templateTitle);
        } else {
          blob += flattenUnknownToSearchText(o);
        }
        extraById[id] = (extraById[id] || '') + ' ' + blob;
      } catch {
        /* ignore */
      }
    }
  }
  for (const r of rows) {
    const add = (extraById[r.id] || '').replace(/\s+/g, ' ').trim();
    if (add) r.searchIndex = `${r.searchIndex} ${add}`;
  }
}

export async function loadProviderOsSearchRows(email: string): Promise<ProviderOsSearchRow[]> {
  await purgeExpiredCompletedExecutionCaches();
  const pullPromise = pullTasks(email).catch((err: unknown) =>
    console.warn('[providerOsSearch] pullTasks falhou (offline?):', err),
  );
  await Promise.race([pullPromise, new Promise((r) => setTimeout(r, 3000))]);
  await pullPromise;
  const events = await AgendaService.getUnifiedAgenda(email, 'PROVIDER');

  const executedStr = await AsyncStorage.getItem('@brspark_executed_tasks') || '[]';
  let executedTasksRaw: any[] = [];
  try {
    executedTasksRaw = JSON.parse(executedStr);
  } catch {
    executedTasksRaw = [];
  }
  if (!Array.isArray(executedTasksRaw)) executedTasksRaw = [];

  const executedMap: Record<string, any> = {};
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let updatedExecs = false;
  const validExecs: any[] = [];
  for (const ex of executedTasksRaw) {
    const item = typeof ex === 'string' ? { id: ex, completedAt: new Date().toISOString() } : ex;
    if (typeof ex === 'string') updatedExecs = true;
    const completedTs = new Date(item.completedAt ?? 0).getTime();
    const age = Number.isFinite(completedTs) ? now - completedTs : 0;
    if (!Number.isFinite(completedTs) || age <= THIRTY_DAYS_MS) {
      validExecs.push(item);
      executedMap[String(item.id)] = item;
    } else {
      updatedExecs = true;
    }
  }
  if (updatedExecs) {
    await AsyncStorage.setItem('@brspark_executed_tasks', JSON.stringify(validExecs));
  }

  const inprogStr = await AsyncStorage.getItem('@brspark_inprogress_tasks') || '[]';
  let inprogressTasks: string[] = [];
  try {
    inprogressTasks = JSON.parse(inprogStr);
  } catch {
    inprogressTasks = [];
  }
  if (!Array.isArray(inprogressTasks)) inprogressTasks = [];
  const outboxInProgIds = await getTaskIdsWithPendingExecutionStatusOutbox();
  const inprogressMerged = Array.from(
    new Set([...inprogressTasks.map((id: string) => String(id)), ...outboxInProgIds.map((id) => String(id))]),
  );

  const accStr = await AsyncStorage.getItem('@brspark_accepted_tasks') || '[]';
  let acceptedTasks: string[] = [];
  try {
    acceptedTasks = JSON.parse(accStr);
  } catch {
    acceptedTasks = [];
  }
  if (!Array.isArray(acceptedTasks)) acceptedTasks = [];
  const acceptedIdSet = new Set(acceptedTasks.map((id: string) => String(id)));

  const rejStr = await AsyncStorage.getItem('@brspark_rejected_tasks') || '[]';
  let rejectedTasks: string[] = [];
  try {
    rejectedTasks = JSON.parse(rejStr);
  } catch {
    rejectedTasks = [];
  }
  if (!Array.isArray(rejectedTasks)) rejectedTasks = [];

  const existingIds = new Set(events.map((e: any) => String(e.id)));
  const combinedEvents = [...events];
  for (const key of Object.keys(executedMap)) {
    if (!existingIds.has(key)) {
      const exData = executedMap[key];
      combinedEvents.push({
        id: key,
        source: 'CHECKLIST',
        category: 'TASK',
        status: 'COMPLETED',
        title: exData.title || `OS Fechada (ID: ${key.substring(0, 6)})`,
        description:
          exData.description || 'Esta Ordem de Serviço foi concluída e arquivada pelo servidor central.',
        startDate: exData.completedAt,
        endDate: exData.completedAt,
        color: exData.color || MEDIA_TAG_COLORS.AFTER,
        metadata: { icon: exData.icon || 'checkmark-done-circle' },
        refId: exData.refId || key,
      } as any);
    }
  }

  const pt_filtered = combinedEvents
    .filter((e: any) => {
      if (e.source !== 'CHECKLIST' && e.category !== 'TASK') return false;
      if (rejectedTasks.includes(String(e.id))) return false;
      return true;
    })
    .filter((e: any) => {
      const isPurged =
        executedTasksRaw.find((raw: any) => (typeof raw === 'string' ? raw : raw.id) === String(e.id)) &&
        !executedMap[String(e.id)];
      return !isPurged;
    });

  const pendingSyncIds = await getTaskIdsWithPendingLocalSyncOverlay();
  const completedSetForMap = new Set(Object.keys(executedMap));
  const inprogSetForMap = new Set(inprogressMerged);

  const rows: ProviderOsSearchRow[] = pt_filtered.map((t: any) => {
    const geo = parseCoordLatLng(t);
    const eff = effectiveProviderTaskStatus(t, completedSetForMap, inprogSetForMap, acceptedIdSet);
    const serviceTitle = t.title || 'Serviço';
    const rawFormTitle = String(t.templateTitle ?? taskMetadataRecord(t).templateTitle ?? '').trim();
    const formTemplateTitle =
      rawFormTitle && rawFormTitle !== String(serviceTitle).trim() ? rawFormTitle : null;
    const executionCreatedIso =
      t.executionCreatedAt != null && String(t.executionCreatedAt).trim() !== ''
        ? String(t.executionCreatedAt).trim()
        : null;
    const createdAtDisplay =
      executionCreatedIso || ymdLocalNoonToIsoUtc(t.startDate) || new Date().toISOString();
    const receivedIso = providerTaskDeviceReceivedAtIso(t);
    const dueIso = providerTaskDueIsoForSort(t);
    const startMs = parseIsoToMs(ymdLocalNoonToIsoUtc(t.startDate) || String(t.startDate || ''));
    const receivedMs = parseIsoToMs(receivedIso) || 0;
    const dueMs = parseIsoToMs(dueIso);
    const createdMs = parseIsoToMs(createdAtDisplay);

    const title = `${taskOsLabel({ ...t, id: String(t.id) })} — ${t.title || 'Manutenção'}`;
    const meta = taskMetadataRecord(t);
    const baseParts = [
      String(t.id),
      String(t.osNumber ?? ''),
      serviceTitle,
      title,
      String(t.description ?? ''),
      String(t.locationAddress ?? ''),
      String(t.refId ?? ''),
      String(formTemplateTitle ?? ''),
      JSON.stringify(meta),
      String(t.templateId ?? ''),
      String(t.asset?.title ?? ''),
      String(t.assetTitle ?? ''),
      pendingSyncIds.has(String(t.id)) ? 'pendente_sincronizacao' : '',
    ];
    const searchIndex = baseParts.join(' ').replace(/\s+/g, ' ').trim();

    return {
      id: String(t.id),
      statusEff: eff,
      title,
      serviceTitle,
      osNumber: t.osNumber ?? null,
      description: String(t.description || ''),
      locationAddress: t.locationAddress ?? null,
      refId: t.refId != null ? String(t.refId) : null,
      formTemplateTitle,
      icon: (t.metadata?.icon || t.icon || null) as string | null,
      startMs: startMs || createdMs,
      receivedMs,
      dueMs: dueMs || 0,
      createdMs: createdMs || startMs,
      searchIndex,
      raw: {
        ...t,
        id: String(t.id),
        locationLat: geo?.lat ?? t.locationLat ?? null,
        locationLng: geo?.lng ?? t.locationLng ?? null,
        status: eff,
        isPendingSync: pendingSyncIds.has(String(t.id)),
        isCachedLocally: false,
      },
    };
  });

  const completedIdList = rows.filter((r) => r.statusEff === 'COMPLETED').map((r) => r.id);
  const execKeys = completedIdList.map((id) => `@brspark_execution_${id}`);
  const pairs = execKeys.length > 0 ? await AsyncStorage.multiGet(execKeys) : [];
  const cacheNow = Date.now();
  const completedBodyCachedIds = new Set<string>();
  for (const [k, v] of pairs) {
    if (!v) continue;
    try {
      const o = JSON.parse(v);
      const dl = Number(o._technicianViewDownloadAt);
      if (Number.isFinite(dl) && cacheNow - dl <= COMPLETED_BODY_LOCAL_TTL_MS) {
        completedBodyCachedIds.add(String(k.replace('@brspark_execution_', '')));
      }
    } catch {
      /* ignore */
    }
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].statusEff === 'COMPLETED' && completedBodyCachedIds.has(rows[i].id)) {
      rows[i] = { ...rows[i], raw: { ...rows[i].raw, isCachedLocally: true } };
    }
  }

  await enrichSearchIndexFromLocalStores(rows);
  return rows;
}
