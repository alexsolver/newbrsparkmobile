import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTaskIdsWithPendingExecutionStatusOutbox } from '../services/syncService';
import { fetchChecklistTemplateSchema, schemaArrayHasTechnicianFinance } from '../services/checklistTemplateSchema';
import { taskOsLabel } from './taskOsLabel';

export type LinkableExpenseTask = {
  id: string;
  refId: string;
  displayLine: string;
};

// ── Mesma lógica que `effectiveProviderTaskStatus` no dashboard (pendentes / em andamento) ──

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

function metaFlagTrue(meta: Record<string, unknown>, key: string): boolean {
  const v = meta[key];
  return v === true || v === 'true' || String(v ?? '').toLowerCase() === 'true';
}

function isDisplacementTrackingPausedMeta(meta: Record<string, unknown>): boolean {
  const v = meta.trackingPaused;
  if (v === false || v === 0 || v === 'false' || v === '0') return false;
  if (v === true || v === 1) return true;
  if (v === 'true' || v === '1') return true;
  return false;
}

function taskMetadataIndicatesRevisionVisit(t: any, meta: Record<string, unknown>): boolean {
  if (metaFlagTrue(meta, 'reopenForRevisionPending') || metaFlagTrue(meta, 'revisionVisitActive')) return true;
  const rc = Number(meta.reopenCount);
  return Number.isFinite(rc) && rc > 0;
}

const SERVER_COMPLETED_STATUSES = new Set([
  'COMPLETED',
  'SYNCED',
  'DONE',
  'CLOSED',
  'FINISHED',
  'COMPLETE',
  'ARCHIVED',
]);

export function effectiveProviderTaskStatus(
  t: any,
  completedIds: Set<string>,
  inprogressIds: Set<string>,
  acceptedIds: Set<string> = new Set()
): string {
  const raw = String(t.status || 'PENDING').toUpperCase();
  const serverActive = ['PENDING', 'RECEIVED', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED'].includes(raw);
  if (SERVER_COMPLETED_STATUSES.has(raw)) return 'COMPLETED';
  if (completedIds.has(String(t.id)) && !serverActive) return 'COMPLETED';
  const meta = taskMetadataRecord(t);
  const reopenRevision = taskMetadataIndicatesRevisionVisit(t, meta);
  if (reopenRevision && (raw === 'PENDING' || raw === 'RECEIVED')) {
    if (inprogressIds.has(String(t.id)) || acceptedIds.has(String(t.id))) return 'IN_PROGRESS';
    return 'PENDING';
  }
  const pausedByMeta =
    meta.executionPaused === true ||
    meta.executionPaused === 'true' ||
    String(meta.executionPaused || '').toLowerCase() === 'true';
  if (raw === 'PAUSED' || pausedByMeta || isDisplacementTrackingPausedMeta(meta)) return 'PAUSED';
  if (inprogressIds.has(String(t.id))) return 'IN_PROGRESS';
  if (raw === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (acceptedIds.has(String(t.id)) && (raw === 'PENDING' || raw === 'RECEIVED')) return 'IN_PROGRESS';
  if (raw === 'RECEIVED') return 'PENDING';
  if (raw === 'ACCEPTED') return 'IN_PROGRESS';
  return raw === 'PENDING' || raw === '' ? 'PENDING' : raw;
}

export function isPendingOrInAttendance(status: string): boolean {
  return status === 'PENDING' || status === 'IN_PROGRESS' || status === 'PAUSED';
}

export async function buildProviderTaskStatusSets(): Promise<{
  completedIds: Set<string>;
  inprogressIds: Set<string>;
  acceptedIds: Set<string>;
}> {
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
  for (const ex of executedTasksRaw) {
    const item = typeof ex === 'string' ? { id: ex, completedAt: new Date().toISOString() } : ex;
    const completedTs = new Date(item.completedAt ?? 0).getTime();
    const age = Number.isFinite(completedTs) ? now - completedTs : 0;
    if (Number.isFinite(completedTs) && age <= THIRTY_DAYS_MS) {
      executedMap[String(item.id)] = item;
    }
  }
  const completedIds = new Set(Object.keys(executedMap));

  const inprogStr = await AsyncStorage.getItem('@brspark_inprogress_tasks') || '[]';
  let inprogressTasks: string[] = [];
  try {
    inprogressTasks = JSON.parse(inprogStr);
  } catch {
    inprogressTasks = [];
  }
  if (!Array.isArray(inprogressTasks)) inprogressTasks = [];
  const outboxInProgIds = await getTaskIdsWithPendingExecutionStatusOutbox();
  const inprogressIds = new Set([
    ...inprogressTasks.map((id: string) => String(id)),
    ...outboxInProgIds.map((id) => String(id)),
  ]);

  const accStr = await AsyncStorage.getItem('@brspark_accepted_tasks') || '[]';
  let acceptedTasks: string[] = [];
  try {
    acceptedTasks = JSON.parse(accStr);
  } catch {
    acceptedTasks = [];
  }
  if (!Array.isArray(acceptedTasks)) acceptedTasks = [];
  const acceptedIds = new Set(acceptedTasks.map((id: string) => String(id)));

  return { completedIds, inprogressIds, acceptedIds };
}

/**
 * OS em «Pendentes» ou «Em andamento» (incl. pausa), com modelo que contém campo custos do técnico.
 */
export async function loadLinkableTasksForTechnicianExpense(): Promise<LinkableExpenseTask[]> {
  const cloudRaw = await AsyncStorage.getItem('@brspark_cloud_tasks') || '[]';
  let tasks: any[] = [];
  try {
    tasks = JSON.parse(cloudRaw);
  } catch {
    tasks = [];
  }
  if (!Array.isArray(tasks)) tasks = [];

  const rejStr = await AsyncStorage.getItem('@brspark_rejected_tasks') || '[]';
  let rejected: string[] = [];
  try {
    rejected = JSON.parse(rejStr);
  } catch {
    rejected = [];
  }
  if (!Array.isArray(rejected)) rejected = [];
  const rejectedSet = new Set(rejected.map((id) => String(id)));

  const { completedIds, inprogressIds, acceptedIds } = await buildProviderTaskStatusSets();

  const candidates: any[] = [];
  for (const t of tasks) {
    if (t?.id == null) continue;
    const id = String(t.id);
    if (rejectedSet.has(id)) continue;
    const eff = effectiveProviderTaskStatus(t, completedIds, inprogressIds, acceptedIds);
    if (!isPendingOrInAttendance(eff)) continue;
    const refId = t.refId != null ? String(t.refId).trim() : '';
    if (!refId || refId === 'null') continue;
    candidates.push(t);
  }

  const refIds = [...new Set(candidates.map((t) => String(t.refId).trim()))];
  const refOk = new Set<string>();
  for (const rid of refIds) {
    const schema = await fetchChecklistTemplateSchema(rid);
    if (schemaArrayHasTechnicianFinance(schema)) refOk.add(rid);
  }

  const out: LinkableExpenseTask[] = [];
  for (const t of candidates) {
    const rid = String(t.refId).trim();
    if (!refOk.has(rid)) continue;
    const label = taskOsLabel({
      osNumber: t.osNumber ?? t.os_number,
      id: String(t.id),
    });
    const title = String(t.title || '').trim() || 'Sem título';
    out.push({
      id: String(t.id),
      refId: rid,
      displayLine: `${label} — ${title}`.slice(0, 120),
    });
  }
  out.sort((a, b) => a.displayLine.localeCompare(b.displayLine, 'pt-BR'));
  return out;
}

export type LinkedTasksFinanceEditOpts = {
  /**
   * Rateio / várias OS: todas têm de existir em `@brspark_cloud_tasks` no aparelho
   * e estar pendentes ou em atendimento (não basta «não estar em concluídas» sem a OS na lista).
   */
  requireAllTasksOnDevice?: boolean;
};

/**
 * OS ainda em «pendentes» ou «em atendimento» (incl. pausa / revisita) — permite editar despesa manual ligada.
 */
export async function linkedTasksAllowFinanceEdit(
  taskIds: string[],
  opts?: LinkedTasksFinanceEditOpts
): Promise<boolean> {
  const ids = [...new Set(taskIds.map((x) => String(x).trim()).filter(Boolean))];
  if (ids.length === 0) return true;

  const strict = opts?.requireAllTasksOnDevice === true;

  const cloudRaw = await AsyncStorage.getItem('@brspark_cloud_tasks') || '[]';
  let tasks: any[] = [];
  try {
    tasks = JSON.parse(cloudRaw);
  } catch {
    tasks = [];
  }
  if (!Array.isArray(tasks)) tasks = [];
  const byId = new Map<string, any>();
  for (const t of tasks) {
    if (t?.id != null) byId.set(String(t.id), t);
  }

  const { completedIds, inprogressIds, acceptedIds } = await buildProviderTaskStatusSets();

  for (const id of ids) {
    const t = byId.get(id);
    if (!t) {
      if (strict) return false;
      if (completedIds.has(id)) return false;
      continue;
    }
    const eff = effectiveProviderTaskStatus(t, completedIds, inprogressIds, acceptedIds);
    if (!isPendingOrInAttendance(eff)) return false;
  }
  return true;
}
