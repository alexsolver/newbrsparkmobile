import { TechnicianStockService } from '../services/technicianStockService';

export type MaterialsLine = {
  itemId: string;
  sku?: string;
  name?: string;
  unit?: string;
  qty: number;
};

export type ParsedMaterials = {
  lines: MaterialsLine[];
  stockAppliedRev: number | null;
  lastApplied: Record<string, number>;
};

export function parseMaterialsValue(raw: unknown): ParsedMaterials {
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    if (!j || typeof j !== 'object') {
      return { lines: [], stockAppliedRev: null, lastApplied: {} };
    }
    const linesRaw = Array.isArray((j as any).lines) ? (j as any).lines : [];
    const lines: MaterialsLine[] = linesRaw
      .map((x: any) => ({
        itemId: String(x?.itemId || '').trim(),
        sku: x?.sku != null ? String(x.sku) : undefined,
        name: x?.name != null ? String(x.name) : undefined,
        unit: x?.unit != null ? String(x.unit) : undefined,
        qty: Math.max(0, Math.floor(Number(x?.qty) || 0)),
      }))
      .filter((l: MaterialsLine) => l.itemId && l.qty > 0);

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

    return { lines, stockAppliedRev, lastApplied };
  } catch {
    return { lines: [], stockAppliedRev: null, lastApplied: {} };
  }
}

export function linesToDesiredMap(lines: MaterialsLine[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const l of lines) {
    const id = String(l.itemId || '').trim();
    const q = Math.max(0, Math.floor(Number(l.qty) || 0));
    if (!id || q <= 0) continue;
    m[id] = (m[id] || 0) + q;
  }
  return m;
}

function sectionAllowsRepeat(sectionField: any) {
  return sectionField?.type === 'section_break' && !!sectionField?.multiple;
}

function buildSections(schemaAll: any[]) {
  const bySection: Record<string, any[]> = {};
  const sectionHeaders: Record<string, any> = {};
  let curSecKey = '__root__';
  for (const f of schemaAll) {
    if (f.type === 'section_break') {
      curSecKey = f.id;
      sectionHeaders[curSecKey] = f;
      continue;
    }
    if (f.type === 'hidden' || !f.id) continue;
    if (!bySection[curSecKey]) bySection[curSecKey] = [];
    bySection[curSecKey].push(f);
  }
  return { bySection, sectionHeaders };
}

/**
 * Ajusta stock local (delta vs último snapshot) e atualiza JSON do campo com stockAppliedRev / lastApplied.
 * Idempotente por submissionRevision.
 */
export async function applyMaterialsStockForSubmission(args: {
  schemaAll: any[];
  responses: Record<string, any>;
  submissionRevision: number;
  taskId: string;
  templateId: string;
  ownerEmail: string;
  /** Número da FT (ex. FT-2026-04-0000001), gravado no motivo para o histórico de estoque. */
  osNumber?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { schemaAll, responses, submissionRevision, taskId, templateId, ownerEmail, osNumber } = args;
  const R = submissionRevision;
  const { bySection, sectionHeaders } = buildSections(schemaAll);

  const initialItems = await TechnicianStockService.getItems(ownerEmail);
  let stockById: Record<string, (typeof initialItems)[number]> = Object.fromEntries(
    initialItems.map((i) => [i.id, i])
  );

  const ensureItemInMap = async (itemId: string) => {
    if (stockById[itemId]) return stockById[itemId];
    const one = await TechnicianStockService.getItemById(itemId);
    if (one) {
      stockById[itemId] = one;
      return one;
    }
    return null;
  };

  const refreshItemInMap = async (itemId: string) => {
    const one = await TechnicianStockService.getItemById(itemId);
    if (one) stockById[itemId] = one;
  };

  const processField = async (
    field: any,
    read: () => any,
    write: (json: string) => void,
    rowSuffix: string
  ) => {
    const raw = read();
    const parsed = parseMaterialsValue(raw);
    if (parsed.stockAppliedRev != null && parsed.stockAppliedRev === R) return;

    const desired = linesToDesiredMap(parsed.lines);
    const prev = parsed.lastApplied || {};
    const ids = new Set([...Object.keys(desired), ...Object.keys(prev)]);

    for (const itemId of ids) {
      const d = desired[itemId] || 0;
      const p = prev[itemId] || 0;
      const delta = d - p;
      if (delta === 0) continue;

      const item = await ensureItemInMap(itemId);
      if (!item) {
        throw new Error(`Item de stock não encontrado (${itemId}). Sincronize o inventário.`);
      }
      if (delta > 0 && item.currentStock < delta) {
        throw new Error(`Saldo insuficiente para "${item.name}" (SKU ${item.sku}).`);
      }

      const ftRaw = osNumber != null ? String(osNumber).trim() : '';
      const ftSeg =
        ftRaw !== '' ? `:FT:${ftRaw.replace(/:/g, '-')}` : '';
      const baseReason = `CHK:${templateId}:TASK:${taskId}:REV:${R}${ftSeg}:FLD:${field.id}${rowSuffix}`;

      if (delta > 0) {
        await TechnicianStockService.recordMovement(
          {
            itemId,
            type: 'OUT',
            quantity: delta,
            responsibleId: ownerEmail,
            reason: baseReason,
          },
          ownerEmail
        );
      } else {
        await TechnicianStockService.recordMovement(
          {
            itemId,
            type: 'IN',
            quantity: -delta,
            responsibleId: ownerEmail,
            reason: `${baseReason}:ADJ`,
          },
          ownerEmail
        );
      }
      await refreshItemInMap(itemId);
    }

    const next = JSON.stringify({
      v: 1,
      lines: parsed.lines,
      stockAppliedRev: R,
      lastApplied: desired,
    });
    write(next);
  };

  try {
    const processedCompositeKeys = new Set<string>();

    const runProcess = async (
      field: any,
      read: () => any,
      write: (json: string) => void,
      rowSuffix: string
    ) => {
      const key = `${field.id}${rowSuffix}`;
      if (processedCompositeKeys.has(key)) return;
      processedCompositeKeys.add(key);
      await processField(field, read, write, rowSuffix);
    };

    for (const [secKey, fields0] of Object.entries(bySection)) {
      const fields = Array.isArray(fields0) ? fields0 : [];
      const sh = sectionHeaders[secKey];
      const isRepeat = sh && sectionAllowsRepeat(sh);
      const isRoot = secKey === '__root__';

      if (isRoot) {
        for (const f of fields) {
          if (f.type !== 'materials_consumption') continue;
          await runProcess(f, () => responses[f.id], (json) => { responses[f.id] = json; }, '');
        }
        continue;
      }

      if (isRepeat) {
        const storageKey = `__section_repeat_${secKey}`;
        const rows = Array.isArray(responses[storageKey]) ? [...responses[storageKey]] : [];
        let mutated = false;
        for (let ri = 0; ri < rows.length; ri++) {
          const row0 = rows[ri];
          const row = row0 && typeof row0 === 'object' ? { ...row0 } : {};
          let rowMutated = false;
          for (const f of fields) {
            if (f.type !== 'materials_consumption') continue;
            await runProcess(
              f,
              () => row[f.id],
              (json) => {
                row[f.id] = json;
                rowMutated = true;
              },
              `:R${ri}`
            );
          }
          if (rowMutated) {
            rows[ri] = row;
            mutated = true;
          }
        }
        if (mutated) responses[storageKey] = rows;
      } else {
        for (const f of fields) {
          if (f.type !== 'materials_consumption') continue;
          await runProcess(f, () => responses[f.id], (json) => { responses[f.id] = json; }, '');
        }
      }
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Erro ao aplicar consumo de materiais.' };
  }
}
