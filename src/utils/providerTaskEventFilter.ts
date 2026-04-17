type AnyRecord = Record<string, unknown>;

function metaRecord(meta: unknown): AnyRecord {
  if (!meta) return {};
  if (typeof meta === 'string') {
    try {
      const parsed = JSON.parse(meta);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as AnyRecord)
        : {};
    } catch {
      return {};
    }
  }
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as AnyRecord) : {};
}

export function eventHasChecklistTemplateLink(e: unknown): boolean {
  const row = e && typeof e === 'object' ? (e as AnyRecord) : {};
  const meta = metaRecord(row.metadata);
  const topHasLink = !!(row.refId || row.templateId);
  const metaHasLink = !!(meta.refId || meta.templateId);
  return topHasLink || metaHasLink;
}

/**
 * Filtro estrito para tarefas do prestador:
 * - eventos de checklist explícitos (`source=CHECKLIST`), ou
 * - tarefas com vínculo de template/checklist (`refId|templateId` no topo ou metadata).
 */
export function isProviderChecklistExecutionEvent(e: unknown): boolean {
  const row = e && typeof e === 'object' ? (e as AnyRecord) : {};
  const src = String(row.source || '').toUpperCase();
  const cat = String(row.category || '').toUpperCase();
  const hasLink = eventHasChecklistTemplateLink(row);
  if (src === 'CHECKLIST') return true;
  if (cat === 'TASK' && hasLink) return true;
  return hasLink;
}

export type ProviderTaskFilterRejectReason =
  | 'not_known_execution'
  | 'not_checklist_event'
  | 'rejected_task'
  | 'routine_task'
  | 'purged_from_executed_cache';

export type ProviderTaskFilterDecision =
  | { ok: true }
  | { ok: false; reason: ProviderTaskFilterRejectReason };

/**
 * Regra de segurança:
 * só ativa o gate de "ID conhecido na execução" quando a lookup remota
 * realmente respondeu e retornou IDs. Isso evita zerar Pendentes/Iniciadas
 * por falha transitória de rede/cache.
 */
export function shouldRequireKnownExecutionGate(params: {
  cloudLookupOk: boolean;
  knownExecutionIdsSize: number;
}): boolean {
  return params.cloudLookupOk && params.knownExecutionIdsSize > 0;
}

export function decideProviderTaskInclusion(params: {
  event: unknown;
  knownExecutionIds: Set<string>;
  executedMap: Record<string, unknown>;
  rejectedIds: Set<string>;
  isRoutineTask: (row: unknown) => boolean;
  activeStatuses: Set<string>;
  executedRawList: unknown[];
  requireKnownExecution?: boolean;
}): ProviderTaskFilterDecision {
  const {
    event,
    knownExecutionIds,
    executedMap,
    rejectedIds,
    isRoutineTask,
    activeStatuses,
    executedRawList,
    requireKnownExecution = true,
  } = params;
  const row = event && typeof event === 'object' ? (event as AnyRecord) : {};
  const id = String(row.id || '').trim();
  const isKnownExecution = (id && knownExecutionIds.has(id)) || !!executedMap[id];
  if (requireKnownExecution && !isKnownExecution) return { ok: false, reason: 'not_known_execution' };
  if (!isProviderChecklistExecutionEvent(row)) return { ok: false, reason: 'not_checklist_event' };
  if (rejectedIds.has(id)) return { ok: false, reason: 'rejected_task' };
  if (isRoutineTask(row)) return { ok: false, reason: 'routine_task' };
  const rawStatus = String(row.status || '').toUpperCase();
  if (activeStatuses.has(rawStatus)) return { ok: true };
  const isPurged =
    executedRawList.some((raw: any) => String(typeof raw === 'string' ? raw : raw?.id || '') === id) &&
    !executedMap[id];
  if (isPurged) return { ok: false, reason: 'purged_from_executed_cache' };
  return { ok: true };
}
