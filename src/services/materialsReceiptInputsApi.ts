import { apiFetch } from './auth';

/** Linha vinda da integração (ERP/CRM) — GET /api/materials-receipt-inputs */
export type MaterialsReceiptInputDto = {
  id: string;
  nome: string;
  sku: string;
  codigo_interno: string;
  qtd: number;
  preco_un?: number | null;
  meta?: unknown;
};

export async function fetchMaterialsReceiptInputs(): Promise<MaterialsReceiptInputDto[]> {
  const res = await apiFetch('/api/materials-receipt-inputs');
  if (res.status === 401 || res.status === 403) {
    console.warn('[materialsReceiptInputs] não autorizado');
    return [];
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `Erro ${res.status} ao carregar materiais da integração.`);
  }
  const data = await res.json().catch(() => ({}));
  const items = Array.isArray(data?.items) ? data.items : [];
  return items as MaterialsReceiptInputDto[];
}
