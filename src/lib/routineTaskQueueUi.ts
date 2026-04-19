/**
 * RT no aparelho: cache em `@brspark_rt_cloud_tasks` (ver `cloudTasksBuckets.ts`).
 * Não entram na lista «Pendentes» do prestador nem na agenda unificada de FT — abertura só pelo menu radial.
 */

const TERMINAL = new Set(['COMPLETED', 'SYNCED', 'CANCELLED', 'CANCELED', 'DONE', 'CLOSED', 'ARCHIVED']);

const IN_FLIGHT = new Set(['IN_PROGRESS', 'RECEIVED', 'ACCEPTED', 'PAUSED']);

export function taskRowIsRoutineTask(ev: any): boolean {
  if (ev?.routineTaskNumber != null && String(ev.routineTaskNumber).trim() !== '') return true;
  const m = ev?.metadata;
  if (m && typeof m === 'object' && (m as { routineTask?: unknown }).routineTask) return true;
  if (String(ev?.source || '').toUpperCase() === 'ROUTINE_TASK') return true;
  return false;
}

function taskStatusUpper(t: any): string {
  return String(t?.status || '').toUpperCase();
}

function isTerminalStatus(st: string): boolean {
  return TERMINAL.has(st);
}

/**
 * ID do modelo de checklist na OS: `refId`, `metadata.refId`, `templateId` no topo ou em `metadata`.
 * Vazio quando o payload não traz modelo (ex.: dados antigos).
 */
export function taskEffectiveChecklistTemplateId(t: any): string {
  const m = t?.metadata && typeof t.metadata === 'object' ? (t.metadata as Record<string, unknown>) : null;
  const refFromMeta = m?.refId != null ? String(m.refId).trim() : '';
  const tplFromMeta = m?.templateId != null ? String(m.templateId).trim() : '';
  const ref = String(t?.refId || refFromMeta || t?.templateId || tplFromMeta || '').trim();
  if (!ref || ref === 'null' || ref === 'undefined') return '';
  return ref;
}

/** Chave do modelo no cache (RT + FT): mesmo critério que `taskEffectiveChecklistTemplateId`. */
export function routineTemplateKey(t: any): string {
  const ref = taskEffectiveChecklistTemplateId(t);
  return ref || `__no_tpl__:${String(t?.id || '')}`;
}

/**
 * Mesma regra que o badge do menu RT + abertura offline: RT reconhecível, mesmo modelo, não terminal.
 * Única fonte de verdade para não haver «conta 1 mas não abre».
 */
export function routineTaskLocalRowMatchesTemplateNonTerminal(t: any, templateId: string): boolean {
  const tid = String(templateId || '').trim();
  if (!tid) return false;
  if (!taskRowIsRoutineTask(t)) return false;
  if (routineTemplateKey(t) !== tid) return false;
  if (isTerminalStatus(taskStatusUpper(t))) return false;
  return true;
}

function createdMs(t: any): number {
  const iso =
    t?.executionCreatedAt != null && String(t.executionCreatedAt).trim() !== ''
      ? String(t.executionCreatedAt).trim()
      : null;
  if (iso) {
    const ms = new Date(iso).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  const sd = t?.startDate;
  if (sd) {
    const ms = new Date(sd).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

/**
 * Entre as RT ativas do mesmo modelo, só uma é exibível: em curso (IN_PROGRESS/…) ou, se não houver, a PENDING mais antiga.
 */
export function isRoutineTaskQueueHeadForWorklist(task: any, allTasks: any[]): boolean {
  if (!taskRowIsRoutineTask(task)) return true;
  const st = taskStatusUpper(task);
  if (isTerminalStatus(st)) return false;

  const key = routineTemplateKey(task);
  const peers = (Array.isArray(allTasks) ? allTasks : []).filter((x) => {
    if (!taskRowIsRoutineTask(x)) return false;
    if (routineTemplateKey(x) !== key) return false;
    return !isTerminalStatus(taskStatusUpper(x));
  });
  if (peers.length === 0) return true;

  const inFlight = peers.filter((x) => IN_FLIGHT.has(taskStatusUpper(x)));
  if (inFlight.length > 0) {
    inFlight.sort((a, b) => createdMs(a) - createdMs(b));
    return String(inFlight[0]?.id) === String(task.id);
  }

  peers.sort((a, b) => createdMs(a) - createdMs(b));
  return String(peers[0]?.id) === String(task.id);
}

/**
 * Quantas execuções RT não terminais existem no cache local (`@brspark_rt_cloud_tasks`) para o modelo (`templateId` / refId).
 */
export function countRoutineTasksInLocalRtCacheForTemplate(rows: any[], templateId: string): number {
  let n = 0;
  for (const t of Array.isArray(rows) ? rows : []) {
    if (routineTaskLocalRowMatchesTemplateNonTerminal(t, templateId)) n += 1;
  }
  return n;
}
