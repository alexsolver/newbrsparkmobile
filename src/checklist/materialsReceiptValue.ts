import { parseMaterialsValue, type MaterialsLine, type ParsedMaterials } from './applyMaterialsStockOnSubmit';

export type ReceiptDecision = 'pending' | 'accepted' | 'rejected';

/** Linha do campo «materiais / entrada» (integração → técnico), v2. */
export type MaterialsReceiptLineV2 = {
  inputId: string;
  name: string;
  sku: string;
  codigoInterno?: string;
  qty: number;
  decision: ReceiptDecision;
  rejectReason?: string;
  meta?: Record<string, unknown> | unknown[] | null;
};

export type ParsedMaterialsReceiptV2 = {
  version: 2;
  lines: MaterialsReceiptLineV2[];
  stockAppliedRev: number | null;
  lastApplied: Record<string, number>;
};

export type ParsedMaterialsReceipt = ParsedMaterialsReceiptV2 | (ParsedMaterials & { version: 1 });

function normDecision(raw: unknown): ReceiptDecision {
  const s = String(raw || '').toLowerCase();
  if (s === 'accepted' || s === 'rejected' || s === 'pending') return s;
  return 'pending';
}

export function parseMaterialsReceiptValue(raw: unknown): ParsedMaterialsReceipt {
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    if (!j || typeof j !== 'object') {
      return { version: 2, lines: [], stockAppliedRev: null, lastApplied: {} };
    }
    const ver = (j as any).v;
    const linesRaw = Array.isArray((j as any).lines) ? (j as any).lines : [];

    const looksV2 =
      ver === 2 ||
      linesRaw.some((x: any) => x && (x.decision != null || x.inputId != null));

    if (looksV2) {
      const lines: MaterialsReceiptLineV2[] = linesRaw
        .map((x: any) => ({
          inputId: String(x?.inputId || x?.itemId || '').trim(),
          name: x?.name != null ? String(x.name) : '',
          sku: x?.sku != null ? String(x.sku) : '',
          codigoInterno:
            x?.codigoInterno != null
              ? String(x.codigoInterno)
              : x?.codigo_interno != null
                ? String(x.codigo_interno)
                : undefined,
          qty: Math.max(0, Math.floor(Number(x?.qty) || 0)),
          decision: normDecision(x?.decision),
          rejectReason: x?.rejectReason != null ? String(x.rejectReason) : undefined,
          meta: x?.meta,
        }))
        .filter((l: MaterialsReceiptLineV2) => l.inputId);

      const revRaw = (j as any).stockAppliedRev;
      const stockAppliedRev =
        revRaw !== undefined && revRaw !== null && Number.isFinite(Number(revRaw)) ? Number(revRaw) : null;

      const la = (j as any).lastApplied;
      const lastApplied: Record<string, number> = {};
      if (la && typeof la === 'object' && !Array.isArray(la)) {
        for (const [k, v] of Object.entries(la)) {
          const n = Math.max(0, Math.floor(Number(v) || 0));
          if (n > 0) lastApplied[k] = n;
        }
      }

      return { version: 2, lines, stockAppliedRev, lastApplied };
    }

    const legacy = parseMaterialsValue(raw);
    return { version: 1, ...legacy };
  } catch {
    return { version: 2, lines: [], stockAppliedRev: null, lastApplied: {} };
  }
}

export function serializeMaterialsReceiptV2(args: {
  lines: MaterialsReceiptLineV2[];
  prevRaw: string | undefined;
}): string {
  const prev = parseMaterialsReceiptValue(args.prevRaw);
  const stockAppliedRev = prev.version === 2 ? prev.stockAppliedRev : null;
  const lastApplied = prev.version === 2 ? prev.lastApplied : {};
  return JSON.stringify({
    v: 2,
    lines: args.lines,
    stockAppliedRev,
    lastApplied: lastApplied && Object.keys(lastApplied).length ? lastApplied : undefined,
  });
}

/** Rejeição exige justificativa não vazia. */
export function materialsReceiptRejectionsValid(lines: MaterialsReceiptLineV2[]): boolean {
  return lines.every(
    (l) =>
      l.decision !== 'rejected' || String(l.rejectReason || '').trim().length > 0
  );
}

/**
 * Campo preenchido para envio (integração v2): todas as linhas decididas; recusas com motivo.
 * Formato legado v1: mantém regra por quantidade (como antes).
 */
export function materialsReceiptFieldIsComplete(raw: unknown, fieldRequired: boolean): boolean {
  const p = parseMaterialsReceiptValue(raw);
  if (p.version === 1) {
    const hasQty = p.lines.some((l) => l.qty > 0);
    if (fieldRequired) return hasQty;
    return true;
  }
  if (!p.lines.length) return true;
  const decided = p.lines.every((l) => l.decision === 'accepted' || l.decision === 'rejected');
  if (!decided) return false;
  return materialsReceiptRejectionsValid(p.lines);
}
