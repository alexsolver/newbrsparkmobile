/**
 * Registo de avisos apenas em desenvolvimento (__DEV__).
 * Evita ruído em produção e dá contexto quando algo falha sem ser tratado ao utilizador.
 */
export function warnDev(context: string, error?: unknown): void {
  if (!__DEV__) return;
  const detail =
    error instanceof Error ? error.message : error !== undefined && error !== null ? String(error) : '';
  console.warn(`[Brspark] ${context}`, detail || '(sem detalhe)');
}
