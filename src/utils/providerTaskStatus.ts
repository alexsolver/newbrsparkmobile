/**
 * Regras centrais de status efetivo de OS (Pendentes / Em andamento / Pausadas / Concluídas).
 * Usado por dashboard, busca e módulos auxiliares para evitar divergência de critérios.
 */

export function providerTaskMetadataRecord(t: any): Record<string, unknown> {
  const m = t?.metadata;
  if (m == null) return {};
  if (typeof m === 'string') {
    try {
      const o = JSON.parse(m);
      return o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
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

/** Pausa de deslocamento (POST /api/tracking/pause) — alinhado a `isTrackingPaused` no backend. */
function isDisplacementTrackingPausedMeta(meta: Record<string, unknown>): boolean {
  const v = meta.trackingPaused;
  if (v === false || v === 0 || v === 'false' || v === '0') return false;
  if (v === true || v === 1) return true;
  if (v === 'true' || v === '1') return true;
  return false;
}

/**
 * Ciclo de revisão após reabertura no painel:
 * `reopenForRevisionPending` só até RECEIVED/ACCEPTED/IN_PROGRESS;
 * `revisionVisitActive` mantém-se na visita; legado: `reopenCount > 0`.
 */
export function taskMetadataIndicatesRevisionVisit(
  _task: any,
  meta: Record<string, unknown>
): boolean {
  if (metaFlagTrue(meta, 'reopenForRevisionPending') || metaFlagTrue(meta, 'revisionVisitActive')) {
    return true;
  }
  const rc = Number(meta.reopenCount);
  return Number.isFinite(rc) && rc > 0;
}

export const SERVER_COMPLETED_STATUSES = new Set([
  'COMPLETED',
  'SYNCED',
  'DONE',
  'CLOSED',
  'FINISHED',
  'COMPLETE',
  'ARCHIVED',
]);

/** Estados ativos na fila do prestador; não podem ser mascarados por cache local de concluídas. */
const SERVER_ACTIVE_STATUSES = new Set(['PENDING', 'RECEIVED', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED']);

/**
 * Oferta (sync: `assignmentMode=BROADCAST` + `claimStatus=OPEN`):
 * o técnico só deve ver no fluxo de aceite global (`BroadcastOfferRootBridge`), não na aba Pendentes até fazer claim.
 */
export function providerTaskIsBroadcastOfferAwaitingClaim(t: unknown): boolean {
  const row = t && typeof t === 'object' ? (t as Record<string, unknown>) : {};
  return Boolean(row.broadcastClaimPending);
}

export function effectiveProviderTaskStatus(
  t: any,
  completedIds: Set<string>,
  inprogressIds: Set<string>,
  acceptedIds: Set<string> = new Set()
): string {
  void acceptedIds;
  const taskId = String(t?.id ?? '');
  const raw = String(t?.status || 'PENDING').toUpperCase();
  if (SERVER_COMPLETED_STATUSES.has(raw)) return 'COMPLETED';
  const meta = providerTaskMetadataRecord(t);
  /**
   * `@brspark_executed_tasks`: conclusão offline-first. Tem de ficar **antes** do ramo de revisão:
   * com metadata de revisão/reopen no snapshot remoto, o servidor pode ainda devolver PENDING no pull
   * enquanto o POST do checklist não fechou a OS — o cartão não pode voltar a «Pendentes» só por isso.
   * Reabertura real no painel: o pull remove o id do cache (`syncPolicy.shouldRemoveExecutedCacheForRemoteTask`).
   */
  if (completedIds.has(taskId)) return 'COMPLETED';
  const reopenRevision = taskMetadataIndicatesRevisionVisit(t, meta);
  if (reopenRevision && (raw === 'PENDING' || raw === 'RECEIVED')) {
    if (inprogressIds.has(taskId)) return 'IN_PROGRESS';
    return 'PENDING';
  }
  const pausedByMeta =
    meta.executionPaused === true ||
    meta.executionPaused === 'true' ||
    String(meta.executionPaused || '').toLowerCase() === 'true';
  if (raw === 'PAUSED' || pausedByMeta || isDisplacementTrackingPausedMeta(meta)) return 'PAUSED';
  if (inprogressIds.has(taskId)) return 'IN_PROGRESS';
  if (raw === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (raw === 'RECEIVED') return 'PENDING';
  if (raw === 'ACCEPTED') return 'PENDING';
  return raw === 'PENDING' || raw === '' ? 'PENDING' : raw;
}
