/**
 * Valor estável guardado em payloads enquanto o reverse geocode corre em segundo plano.
 * Mantido literal (pt) para compatibilidade com dados já sincronizados e checks no syncService.
 */
export const ASYNC_ADDRESS_PENDING = 'A obter endereço…';

export function isAsyncAddressPending(addr: string | null | undefined): boolean {
  if (addr == null || typeof addr !== 'string') return false;
  const s = addr.trim();
  return s === ASYNC_ADDRESS_PENDING || s === 'A obter endereço...';
}
