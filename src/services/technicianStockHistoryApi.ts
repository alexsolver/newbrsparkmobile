import { apiFetch } from './auth';

export type TechStockMovementSearchRow = {
  id: string;
  itemId: string;
  type: string;
  quantity: number;
  timestamp: string;
  reason?: string | null;
  responsibleId?: string | null;
  unitPrice?: number | null;
  destinationAssetId?: string | null;
  subLocation?: string | null;
  owner_email?: string | null;
  itemSku?: string | null;
  itemName?: string | null;
};

export type TechStockMovementSearchResponse = {
  items: TechStockMovementSearchRow[];
  total: number;
  truncated: boolean;
  from: string | null;
  to: string | null;
};

export async function fetchTechStockMovementSearch(
  ownerEmail: string,
  fromIso: string,
  toIso: string,
): Promise<TechStockMovementSearchResponse> {
  const params = new URLSearchParams({
    owner_email: ownerEmail,
    from: fromIso,
    to: toIso,
  });
  const res = await apiFetch(`/api/sync/tech-stock/movements/search?${params.toString()}`);
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let msg = errText || `HTTP ${res.status}`;
    try {
      const j = JSON.parse(errText);
      if (j?.error) msg = String(j.error);
    } catch {
      /* texto plano */
    }
    throw new Error(msg);
  }
  return res.json();
}
