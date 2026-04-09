'use strict';

/**
 * Última revisão concluída mostrada ao usuário: max(coluna ChecklistExecution.lastSubmittedRevision,
 * maior revision em ChecklistExecutionRevision). Evita relatório/PDF com "—" quando há snapshots na tabela.
 */
function effectiveLastSubmittedRevision(storedLsr, latestRevisionFromTable) {
  const a = Number(storedLsr) || 0;
  const b =
    latestRevisionFromTable !== undefined && latestRevisionFromTable !== null
      ? Number(latestRevisionFromTable) || 0
      : 0;
  return Math.max(a, b);
}

module.exports = { effectiveLastSubmittedRevision };
