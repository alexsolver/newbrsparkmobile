/**
 * Campo «receitas do técnico» alimentado por integração (API). Só aceite — sem edição de valor/descrição.
 */

export type RevenueAcceptDecision = 'pending' | 'accepted';

export type TechnicianRevenueIntLine = {
  inputId: string;
  description: string;
  amount: number;
  /** Números das FTs de origem (ex.: FT-2026-04-0000001) vindos da integração. */
  originFts: string[];
  decision: RevenueAcceptDecision;
  entryId?: string;
};

export type ParsedTechnicianRevenueField = {
  version: 2;
  lines: TechnicianRevenueIntLine[];
  financeAppliedRev: number | null;
};

function normFts(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/[,;]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function parseTechnicianRevenueIntegrationValue(raw: unknown): ParsedTechnicianRevenueField | { version: 0; lines: [] } {
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    if (!j || typeof j !== 'object') {
      return { version: 0, lines: [] };
    }
    if ((j as any).v !== 2 || (j as any).source !== 'technician_revenue_integration') {
      return { version: 0, lines: [] };
    }
    const linesRaw = Array.isArray((j as any).lines) ? (j as any).lines : [];
    const lines: TechnicianRevenueIntLine[] = linesRaw
      .map((x: any) => {
        const decision = String(x?.decision || '').toLowerCase() === 'accepted' ? 'accepted' : 'pending';
        return {
          inputId: String(x?.inputId || '').trim(),
          description: x?.description != null ? String(x.description) : '',
          amount: Math.max(0, Number(String(x?.amount ?? '').replace(',', '.')) || 0),
          originFts: Array.isArray(x?.originFts) ? normFts(x.originFts) : normFts(x?.origin_fts),
          decision,
          entryId: x?.entryId != null ? String(x.entryId).trim() : undefined,
        };
      })
      .filter((l: TechnicianRevenueIntLine) => l.inputId);

    const revRaw = (j as any).financeAppliedRev;
    const financeAppliedRev =
      revRaw !== undefined && revRaw !== null && Number.isFinite(Number(revRaw)) ? Number(revRaw) : null;

    return { version: 2, lines, financeAppliedRev };
  } catch {
    return { version: 0, lines: [] };
  }
}

export function serializeTechnicianRevenueIntegration(args: {
  lines: TechnicianRevenueIntLine[];
  prevRaw: string | undefined;
}): string {
  const prev = parseTechnicianRevenueIntegrationValue(args.prevRaw);
  const financeAppliedRev = prev.version === 2 ? prev.financeAppliedRev : null;
  return JSON.stringify({
    v: 2,
    source: 'technician_revenue_integration',
    lines: args.lines,
    financeAppliedRev: financeAppliedRev ?? undefined,
  });
}

export function buildRevenueEntryDescription(line: TechnicianRevenueIntLine): string {
  const base = String(line.description || '').trim();
  const fts = line.originFts.filter(Boolean);
  if (!fts.length) return base || 'Receita (integração)';
  const ftBlock = `FTs origem: ${fts.join(', ')}`;
  return base ? `${base}\n${ftBlock}` : ftBlock;
}

export function technicianRevenueFieldIsComplete(raw: unknown, fieldRequired: boolean): boolean {
  const p = parseTechnicianRevenueIntegrationValue(raw);
  if (p.version !== 2) {
    if (fieldRequired) return false;
    return true;
  }
  if (p.lines.length === 0) return !fieldRequired;
  return p.lines.every((l) => l.decision === 'accepted');
}
