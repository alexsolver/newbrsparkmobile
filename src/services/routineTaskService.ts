import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './auth';
import { loadRtCloudTasks, saveRtCloudTasks } from '../lib/cloudTasksBuckets';
import {
  routineTaskLocalRowMatchesTemplateNonTerminal,
  routineTemplateKey,
} from '../lib/routineTaskQueueUi';

export type RoutineTaskAssignmentDto = {
  templateId: string;
  title: string;
  description?: string | null;
  sortOrder?: number;
  /** Limite de execuções RT ativas no servidor (cache no aparelho), 1–20. */
  mobilePrefetchSlots?: number;
  /** Quantas RT ativas existem neste momento para este modelo. */
  rtActiveCount?: number;
  /** Ícone do modelo no Form Builder (`ChecklistTemplate.metadata`). */
  icon?: string | null;
  iconLibrary?: string | null;
  iconColor?: string | null;
};

export type RoutineTaskOpenResult = {
  executionId: string;
  routineTaskNumber: string;
  templateId: string;
  reused: boolean;
};

const RT_ASSIGNMENTS_CACHE_KEY = '@brspark_rt_assignments_cache_v1';
const TEMPLATES_STORAGE_KEY = '@brspark_templates';

const RT_TERMINAL = new Set(['COMPLETED', 'SYNCED', 'CANCELLED', 'CANCELED', 'DONE', 'CLOSED', 'ARCHIVED']);

function statusUpper(t: any): string {
  return String(t?.status || '').toUpperCase();
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
    const tpl = routineTemplateKey(t);
    if (!tpl || tpl.startsWith('__no_tpl__:')) continue;
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

function pickReusableLocalRtExecution(
  rows: any[],
  templateId: string
): { executionId: string; routineTaskNumber: string; templateId: string } | null {
  const tid = String(templateId || '').trim();
  if (!tid) return null;
  const matches = rows.filter((t) => routineTaskLocalRowMatchesTemplateNonTerminal(t, tid));
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
  const executionId = String(
    best?.id || (best as Record<string, unknown>)?.execution_id || (best as Record<string, unknown>)?.executionId || ''
  ).trim();
  const routineTaskNumber = String(
    best?.routineTaskNumber ||
      best?.osNumber ||
      (best as Record<string, unknown>)?.routine_task_number ||
      ''
  ).trim();
  if (!executionId || !routineTaskNumber) {
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

/** Garante que o JSON do modelo existe em `@brspark_templates` (mesma chave que o checklist). */
export async function cacheChecklistTemplateIfMissing(
  templateId: string,
  opts?: { timeoutMs?: number }
): Promise<boolean> {
  const tid = String(templateId || '').trim();
  if (!tid) return false;
  let db: Record<string, { schemaData?: unknown }> = {};
  try {
    const raw = await AsyncStorage.getItem(TEMPLATES_STORAGE_KEY);
    db = raw ? JSON.parse(raw) : {};
    if (!db || typeof db !== 'object' || Array.isArray(db)) db = {};
  } catch {
    db = {};
  }
  const cur = (db as Record<string, any>)[tid];
  if (cur && cur.schemaData) return true;

  const timeoutMs = opts?.timeoutMs ?? 15_000;
  try {
    const res = await apiFetch(
      `/api/checklists/templates/${encodeURIComponent(tid)}?_t=${Date.now()}`,
      { timeoutMs }
    );
    if (!res.ok) return false;
    const tmpl = await res.json();
    (db as Record<string, unknown>)[tid] = tmpl;
    await AsyncStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(db));
    return !!(tmpl && tmpl.schemaData);
  } catch {
    return false;
  }
}

export async function prefetchRoutineTaskTemplates(assignments: RoutineTaskAssignmentDto[]): Promise<void> {
  await Promise.allSettled(
    assignments.map((a) => cacheChecklistTemplateIfMissing(a.templateId, { timeoutMs: 12_000 }))
  );
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
  try {
    const res = await apiFetch('/api/routine-tasks/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId }),
    });
    j = (await res.json().catch(() => ({}))) as RoutineTaskOpenResult & { error?: string };
    httpOk = res.ok && !!j.executionId && !!j.routineTaskNumber;
  } catch {
    j = {} as RoutineTaskOpenResult & { error?: string };
  }

  let reused = false;
  if (!httpOk) {
    const rowsForPick = await loadRtCloudTasks();
    const local = pickReusableLocalRtExecution(rowsForPick, templateId);
    if (!local) {
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

  const tplId = String(j.templateId || templateId).trim();
  if (tplId) {
    if (httpOk) {
      await cacheChecklistTemplateIfMissing(tplId, { timeoutMs: 22_000 });
    } else {
      void cacheChecklistTemplateIfMissing(tplId, { timeoutMs: 6000 });
    }
  }

  return {
    executionId: String(j.executionId),
    routineTaskNumber: String(j.routineTaskNumber),
    templateId: String(j.templateId),
    reused,
  };
}
