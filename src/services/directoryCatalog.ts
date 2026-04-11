import { API_BASE } from './auth';
import { ensureDirectoryCmsOriginLoaded } from '../utils/directoryMediaUrl';

const directoryFetchInit: RequestInit = {
  cache: 'no-store',
  headers: {
    Accept: 'application/json',
    'Cache-Control': 'no-cache, no-store',
    Pragma: 'no-cache',
  },
};

/** Detalhe público do diretório (empresa + serviços), mesmo contrato que `PublicDirectoryPresenter::mapDetailPayload`. */
export async function fetchPublicProviderDetail(
  tenantId: string,
  opts?: { bustCache?: boolean }
): Promise<Record<string, unknown>> {
  await ensureDirectoryCmsOriginLoaded();
  const bust = opts?.bustCache ? `?_=${Date.now()}` : '';
  const path = `${API_BASE}/api/public/directory/providers/${encodeURIComponent(tenantId)}`;
  let url = `${path}${bust}`;
  let res = await fetch(url, directoryFetchInit);
  if (res.status === 304) {
    url = `${path}?_r=${Date.now()}`;
    res = await fetch(url, directoryFetchInit);
  }
  if (!res.ok) {
    const err = new Error(`Falha ao carregar empresa (${res.status})`);
    (err as any).status = res.status;
    throw err;
  }
  return res.json() as Promise<Record<string, unknown>>;
}
