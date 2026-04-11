import { API_BASE } from './auth';

/** Detalhe público do diretório (empresa + serviços), mesmo contrato que `PublicDirectoryPresenter::mapDetailPayload`. */
export async function fetchPublicProviderDetail(tenantId: string): Promise<Record<string, unknown>> {
  const url = `${API_BASE}/api/public/directory/providers/${encodeURIComponent(tenantId)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) {
    const err = new Error(`Falha ao carregar empresa (${res.status})`);
    (err as any).status = res.status;
    throw err;
  }
  return res.json() as Promise<Record<string, unknown>>;
}
