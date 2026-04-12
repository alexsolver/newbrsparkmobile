import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './auth';
import { loadRtCloudTasks, saveRtCloudTasks } from '../lib/cloudTasksBuckets';
import { taskRowIsRoutineTask } from '../lib/routineTaskQueueUi';

export type RoutineTaskAssignmentDto = {
  templateId: string;
  title: string;
  description?: string | null;
  sortOrder?: number;
  /** Limite de execuções RT ativas no servidor (cache no aparelho), 1–20. */
  mobilePrefetchSlots?: number;
  /** Quantas RT ativas existem neste momento para este modelo. */
  rtActiveCount?: number;
};

export type RoutineTaskOpenResult = {
  executionId: string;
  routineTaskNumber: string;
  templateId: string;
  reused: boolean;
};

const RT_ASSIGNMENTS_CACHE_KEY = '@brspark_rt_assignments_cache_v1';

// #region agent log
function agentLogRt(hypothesisId: string, location: string, message: string, data: Record<string, unknown>) {
  const payload = {
    sessionId: 'd392c6',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  if (__DEV__) {
    console.warn('[DEBUG_RT]', JSON.stringify(payload));
  }
  fetch('http://127.0.0.1:7648/ingest/3c4839dc-67e2-4b6c-bba8-db6b907bdf66', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'd392c6' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

/** Diagnóstico pick offline — sem PII (só ids booleanos e status). */
function buildRtPickDiagnostics(rows: any[], tid: string) {
  const rowsArr = Array.isArray(rows) ? rows : [];
  let rowsMatchingRef = 0;
  let afterIsRt = 0;
  let afterNonTerm = 0;
  let afterIds = 0;
  const samples: { st: string; hasId: boolean; hasRn: boolean; refEq: boolean; isRt: boolean }[] = [];
  for (const t of rowsArr) {
    const ref = rtTemplateRefFromRow(t);
    if (ref === tid) rowsMatchingRef += 1;
    const isRt = taskRowIsRoutineTask(t);
    const nt = isLocalRtRowNonTerminal(t);
    const eid = String(t?.id || '').trim();
    const rn = String(t?.routineTaskNumber || t?.osNumber || '').trim();
    if (ref === tid && isRt) afterIsRt += 1;
    if (ref === tid && isRt && nt) afterNonTerm += 1;
    if (ref === tid && isRt && nt && eid && rn) afterIds += 1;
    if (samples.length < 6 && ref === tid) {
      samples.push({
        st: statusUpper(t) || '(empty)',
        hasId: !!eid,
        hasRn: !!rn,
        refEq: ref === tid,
        isRt,
      });
    }
  }
  return {
    tidLen: tid.length,
    rowCount: rowsArr.length,
    rowsMatchingRef,
    rowsRefAndIsRt: afterIsRt,
    rowsPickFilter: afterNonTerm,
    rowsWithIds: afterIds,
    samples,
  };
}
// #endregion

const RT_TERMINAL = new Set(['COMPLETED', 'SYNCED', 'CANCELLED', 'CANCELED', 'DONE', 'CLOSED', 'ARCHIVED']);

function statusUpper(t: any): string {
  return String(t?.status || '').toUpperCase();
}

/** Alinhado a `routineTemplateKey` em `routineTaskQueueUi.ts` — identifica o modelo RT da linha no cache. */
function rtTemplateRefFromRow(t: any): string {
  const m = t?.metadata;
  const refFromMeta =
    m && typeof m === 'object' && (m as { refId?: unknown }).refId != null
      ? String((m as { refId?: string }).refId).trim()
      : '';
  return String(t?.refId || refFromMeta || t?.templateId || '').trim();
}

function mapAssignmentRow(a: RoutineTaskAssignmentDto): RoutineTaskAssignmentDto {
  return {
    ...a,
    mobilePrefetchSlots:
      typeof a.mobilePrefetchSlots === 'number' && Number.isFinite(a.mobilePrefetchSlots)
        ? Math.min(20, Math.max(1, Math.floor(a.mobilePrefetchSlots)))
        : 1,
    rtActiveCount:
      typeof a.rtActiveCount === 'number' && Number.isFinite(a.rtActiveCount)
        ? Math.max(0, Math.floor(a.rtActiveCount))
        : undefined,
  };
}

async function readCachedRoutineTaskAssignments(): Promise<RoutineTaskAssignmentDto[]> {
  try {
    const raw = await AsyncStorage.getItem(RT_ASSIGNMENTS_CACHE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.map((x: RoutineTaskAssignmentDto) => mapAssignmentRow(x));
  } catch {
    return [];
  }
}

async function writeCachedRoutineTaskAssignments(list: RoutineTaskAssignmentDto[]): Promise<void> {
  await AsyncStorage.setItem(RT_ASSIGNMENTS_CACHE_KEY, JSON.stringify(list));
}

/** Quando o servidor não responde: reconstrói entradas do menu a partir das RT ainda no aparelho. */
function deriveAssignmentsFromRtCloudTasksRows(rows: any[]): RoutineTaskAssignmentDto[] {
  const byTpl = new Map<string, RoutineTaskAssignmentDto>();
  for (const t of rows) {
    const st = statusUpper(t);
    if (RT_TERMINAL.has(st)) continue;
    const tpl = rtTemplateRefFromRow(t);
    if (!tpl) continue;
    if (byTpl.has(tpl)) continue;
    const m = t.metadata && typeof t.metadata === 'object' ? (t.metadata as { templateTitle?: unknown; title?: unknown }) : {};
    const titleHint =
      String(t.templateTitle || m.templateTitle || t.title || 'Tarefa de rotina').trim() || 'Tarefa de rotina';
    byTpl.set(tpl, {
      templateId: tpl,
      title: titleHint,
      description: typeof t.description === 'string' ? t.description : null,
      mobilePrefetchSlots: 1,
    });
  }
  return [...byTpl.values()];
}

/**
 * Mesma ideia que `countRoutineTasksInLocalRtCacheForTemplate`: RT não terminal no cache.
 * Antes só aceitávamos um subconjunto estrito de `status` — linhas com `status` vazio ou fora desse
 * conjunto contavam no badge (não terminais) mas não reabriam offline.
 */
function isLocalRtRowNonTerminal(t: any): boolean {
  const st = statusUpper(t);
  if (!st) return true;
  return !RT_TERMINAL.has(st);
}

function pickReusableLocalRtExecution(
  rows: any[],
  templateId: string
): { executionId: string; routineTaskNumber: string; templateId: string } | null {
  const tid = String(templateId || '').trim();
  if (!tid) return null;
  const matches = rows.filter((t) => {
    if (!taskRowIsRoutineTask(t)) return false;
    if (rtTemplateRefFromRow(t) !== tid) return false;
    if (!isLocalRtRowNonTerminal(t)) return false;
    return true;
  });
  if (matches.length === 0) return null;
  const inProg = matches.filter((t) => statusUpper(t) === 'IN_PROGRESS');
  const pool = inProg.length ? inProg : matches;
  const ms = (x: any) => {
    const iso = x.executionCreatedAt || x.startDate;
    const n = iso ? new Date(iso).getTime() : 0;
    return Number.isFinite(n) ? n : 0;
  };
  pool.sort((a, b) => ms(b) - ms(a));
  const best = pool[0];
  const executionId = String(best.id || '').trim();
  const routineTaskNumber = String(best.routineTaskNumber || best.osNumber || '').trim();
  if (!executionId || !routineTaskNumber) {
    // #region agent log
    agentLogRt('C', 'routineTaskService.ts:pickReusableLocalRtExecution', 'pick_best_missing_ids', {
      matchesLen: matches.length,
      hasExecutionId: !!executionId,
      hasRoutineTaskNumber: !!routineTaskNumber,
    });
    // #endregion
    return null;
  }
  return { executionId, routineTaskNumber, templateId: tid };
}

/**
 * Modelos RT do utilizador. Offline: último JSON de `/api/routine-tasks/me` ou inferência a partir de `@brspark_rt_cloud_tasks`.
 */
export async function fetchRoutineTaskAssignments(): Promise<RoutineTaskAssignmentDto[]> {
  try {
    const res = await apiFetch('/api/routine-tasks/me');
    if (res.ok) {
      const j = (await res.json().catch(() => ({}))) as { assignments?: RoutineTaskAssignmentDto[] };
      const raw = Array.isArray(j.assignments) ? j.assignments : [];
      const list = raw.map((a) => mapAssignmentRow(a));
      await writeCachedRoutineTaskAssignments(list);
      return list;
    }
  } catch (e) {
    console.warn('[routineTaskService] /routine-tasks/me indisponível — usando cache local', e);
  }
  const cached = await readCachedRoutineTaskAssignments();
  if (cached.length > 0) {
    return cached;
  }
  const rtRows = await loadRtCloudTasks();
  const derived = deriveAssignmentsFromRtCloudTasksRows(rtRows);
  return derived;
}

/**
 * Abre ou reutiliza uma instância RT e regista no cache local RT (`@brspark_rt_cloud_tasks`) para o checklist.
 * Offline: reutiliza execução ativa do mesmo modelo já presente no aparelho, se existir.
 */
export async function openRoutineTaskAndCacheCloudTask(
  templateId: string,
  opts?: { titleHint?: string }
): Promise<RoutineTaskOpenResult | null> {
  const titleHint = opts?.titleHint?.trim() || 'Tarefa de rotina';

  let j = {} as RoutineTaskOpenResult & { error?: string };
  let httpOk = false;
  let resStatus: number | string = 'no_response';
  try {
    const res = await apiFetch('/api/routine-tasks/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId }),
    });
    resStatus = res.status;
    j = (await res.json().catch(() => ({}))) as RoutineTaskOpenResult & { error?: string };
    httpOk = res.ok && !!j.executionId && !!j.routineTaskNumber;
  } catch {
    j = {} as RoutineTaskOpenResult & { error?: string };
    resStatus = 'fetch_throw';
  }

  // #region agent log
  agentLogRt('A', 'routineTaskService.ts:openRoutineTaskAndCacheCloudTask', 'after_open_post', {
    httpOk,
    resStatus,
    hasExecId: !!j.executionId,
    hasRtNum: !!j.routineTaskNumber,
    reusedFlag: !!j.reused,
    errLen: typeof j.error === 'string' ? j.error.length : 0,
  });
  // #endregion

  let reused = false;
  if (!httpOk) {
    const rowsForPick = await loadRtCloudTasks();
    // #region agent log
    agentLogRt('B', 'routineTaskService.ts:openRoutineTaskAndCacheCloudTask', 'before_local_pick', {
      ...buildRtPickDiagnostics(rowsForPick, String(templateId || '').trim()),
    });
    // #endregion
    const local = pickReusableLocalRtExecution(rowsForPick, templateId);
    if (!local) {
      // #region agent log
      agentLogRt('D', 'routineTaskService.ts:openRoutineTaskAndCacheCloudTask', 'local_pick_null', {
        ...buildRtPickDiagnostics(rowsForPick, String(templateId || '').trim()),
      });
      // #endregion
      const serverMsg = typeof j.error === 'string' ? j.error.trim() : '';
      throw new Error(
        serverMsg ||
          'Sem ligação ao servidor para criar uma nova tarefa de rotina. Com internet, abra de novo; ou retome uma RT deste modelo que já esteja em curso no aparelho.'
      );
    }
    j = {
      executionId: local.executionId,
      routineTaskNumber: local.routineTaskNumber,
      templateId: local.templateId,
      reused: true,
    };
    reused = true;
    // #region agent log
    agentLogRt('D', 'routineTaskService.ts:openRoutineTaskAndCacheCloudTask', 'local_pick_ok', {
      reused: true,
      execIdLen: String(local.executionId || '').length,
      rtNumLen: String(local.routineTaskNumber || '').length,
    });
    // #endregion
  } else {
    reused = !!j.reused;
  }

  try {
    const arr = await loadRtCloudTasks();
    const ix = arr.findIndex((x: any) => String(x.id) === String(j.executionId));
    const synthetic = {
      id: String(j.executionId),
      osNumber: String(j.routineTaskNumber),
      routineTaskNumber: String(j.routineTaskNumber),
      refId: j.templateId,
      category: 'TASK',
      source: 'ROUTINE_TASK',
      metadata: {
        routineTask: true,
        refId: j.templateId,
        title: `${String(j.routineTaskNumber)} — ${titleHint}`,
        templateTitle: titleHint,
      },
      title: `${String(j.routineTaskNumber)} — ${titleHint}`,
      templateTitle: titleHint,
      description: 'Tarefa de rotina',
      status: 'IN_PROGRESS',
      locationLat: null,
      locationLng: null,
      locationRadius: null,
      locationAddress: null,
      locationZoneType: null,
      locationPolygon: null,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      isAllDay: true,
      executionCreatedAt: new Date().toISOString(),
    };
    if (ix >= 0) arr[ix] = { ...arr[ix], ...synthetic };
    else arr.unshift(synthetic);
    await saveRtCloudTasks(arr);
  } catch {
    /* ignore cache errors */
  }

  return {
    executionId: String(j.executionId),
    routineTaskNumber: String(j.routineTaskNumber),
    templateId: String(j.templateId),
    reused,
  };
}
