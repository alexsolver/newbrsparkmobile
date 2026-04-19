import { apiFetch } from './auth';

export type TechnicianRevenueInputDto = {
  id: string;
  descricao: string;
  valor: number;
  fts_origem?: string[] | null;
  meta?: unknown;
};

export async function fetchTechnicianRevenueInputs(): Promise<TechnicianRevenueInputDto[]> {
  const res = await apiFetch('/api/technician-revenue-inputs');
  if (res.status === 401 || res.status === 403) {
    console.warn('[technicianRevenueInputs] não autorizado');
    return [];
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `Erro ${res.status} ao carregar receitas da integração.`);
  }
  const data = await res.json().catch(() => ({}));
  const items = Array.isArray(data?.items) ? data.items : [];
  return items as TechnicianRevenueInputDto[];
}
