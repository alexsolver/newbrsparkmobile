/**
 * Regras puras de classificação/saneamento de estado no sincronismo.
 * Mantido sem dependências de React Native para facilitar regressões automatizadas.
 */

const ACTIVE_TASK_STATUSES = new Set(['PENDING', 'RECEIVED', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED']);

function metadataRecord(meta: unknown): Record<string, unknown> {
  if (meta == null) return {};
  if (typeof meta === 'string') {
    try {
      const o = JSON.parse(meta);
      return o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof meta === 'object') return meta as Record<string, unknown>;
  return {};
}

export function metadataIndicatesAdminRevisionCycle(meta: unknown): boolean {
  const m = metadataRecord(meta);
  const reopenForRevisionPending =
    m.reopenForRevisionPending === true ||
    m.reopenForRevisionPending === 'true' ||
    String(m.reopenForRevisionPending || '').toLowerCase() === 'true';
  const revisionVisitActive =
    m.revisionVisitActive === true ||
    m.revisionVisitActive === 'true' ||
    String(m.revisionVisitActive || '').toLowerCase() === 'true';
  if (reopenForRevisionPending || revisionVisitActive) return true;
  const reopenCount = Number(m.reopenCount);
  return Number.isFinite(reopenCount) && reopenCount > 0;
}

/**
 * Decide se o id deve sair de `@brspark_executed_tasks` com base no snapshot remoto.
 * Só remove em ciclo explícito de revisão/reabertura.
 */
export function shouldRemoveExecutedCacheForRemoteTask(
  remoteTask: { id?: unknown; status?: unknown; metadata?: unknown },
  pendingChecklistOutboxTaskIds: Set<string>
): boolean {
  if (remoteTask?.id == null) return false;
  const id = String(remoteTask.id);
  if (pendingChecklistOutboxTaskIds.has(id)) return false;
  const status = String(remoteTask?.status || '').toUpperCase();
  if (!ACTIVE_TASK_STATUSES.has(status)) return false;
  return metadataIndicatesAdminRevisionCycle(remoteTask?.metadata);
}
