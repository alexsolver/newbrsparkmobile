/**
 * Intenção de abrir uma OS na agenda do prestador após toque numa notificação (cold start ou ação).
 * O separador Início consome quando `providerTasks` já contém o id.
 */
let _pendingExecutionId: string | null = null;

export function setPendingOpenExecutionFromPush(executionId: string | null | undefined) {
  const id = String(executionId || '').trim();
  _pendingExecutionId = id || null;
}

export function peekPendingOpenExecutionFromPush(): string | null {
  return _pendingExecutionId;
}

export function takePendingOpenExecutionFromPush(): string | null {
  const x = _pendingExecutionId;
  _pendingExecutionId = null;
  return x;
}
