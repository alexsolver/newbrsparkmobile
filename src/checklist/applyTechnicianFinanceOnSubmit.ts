import {
  deleteTechFinanceEntriesExceptIds,
  getTechFinanceRowById,
  saveTechFinanceEntryLocal,
} from '../database';
import type { TechnicianFinanceKind } from '../types/technicianFinance';
import {
  effectiveSchemaFieldType,
  isTechnicianFinanceFieldType,
  technicianFinanceFieldMode,
} from '../services/checklistTemplateSchema';
import {
  buildRevenueEntryDescription,
  parseTechnicianRevenueIntegrationValue,
  type TechnicianRevenueIntLine,
} from './technicianRevenueIntegrationValue';

export type FinanceLine = {
  entryId?: string;
  kind: TechnicianFinanceKind;
  amount: number;
  description?: string;
  categoryKey?: string;
};

export type ParsedFinanceField = {
  lines: FinanceLine[];
  financeAppliedRev: number | null;
};

export function parseTechnicianFinanceValue(raw: unknown): ParsedFinanceField {
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    if (!j || typeof j !== 'object') {
      return { lines: [], financeAppliedRev: null };
    }
    const linesRaw = Array.isArray((j as any).lines) ? (j as any).lines : [];
    const lines: FinanceLine[] = linesRaw
      .map((x: any) => ({
        entryId: x?.entryId != null ? String(x.entryId).trim() : undefined,
        kind: x?.kind === 'revenue' ? 'revenue' : 'expense',
        amount: Math.max(0, Number(String(x?.amount ?? '').replace(',', '.')) || 0),
        description: x?.description != null ? String(x.description) : undefined,
        categoryKey:
          x?.categoryKey != null && String(x.categoryKey).trim() !== ''
            ? String(x.categoryKey).trim()
            : undefined,
      }))
      .filter((l: FinanceLine) => l.amount > 0);

    const revRaw = (j as any).financeAppliedRev;
    const financeAppliedRev =
      revRaw !== undefined && revRaw !== null && Number.isFinite(Number(revRaw)) ? Number(revRaw) : null;

    return { lines, financeAppliedRev };
  } catch {
    return { lines: [], financeAppliedRev: null };
  }
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
 * Persiste linhas no SQLite (tech_finance_entries) com vínculo à OS/campo e atualiza o JSON com entryIds + financeAppliedRev.
 */
export async function applyTechnicianFinanceForSubmission(args: {
  schemaAll: any[];
  responses: Record<string, any>;
  submissionRevision: number;
  taskId: string;
  templateId: string;
  ownerEmail: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { schemaAll, responses, submissionRevision, taskId, templateId, ownerEmail } = args;
  const R = submissionRevision;
  const { bySection, sectionHeaders } = buildSections(schemaAll);

  const processField = async (
    field: any,
    read: () => any,
    write: (json: string) => void,
    rowSuffix: string
  ) => {
    const raw = read();
    const mode = technicianFinanceFieldMode(field);

    if (mode === 'revenue') {
      const integ = parseTechnicianRevenueIntegrationValue(raw);
      if (integ.version !== 2) {
        return;
      }
      if (integ.financeAppliedRev != null && integ.financeAppliedRev === R) return;

      const scopeSuffix = rowSuffix || '';
      const toApply = integ.lines.filter((l) => l.decision === 'accepted' && l.amount > 0);
      const keepIds: string[] = [];
      const entryByInput = new Map<string, string>();

      for (const line of toApply) {
        let entryId = line.entryId?.trim() || '';
        if (!entryId) {
          entryId = `tech_fin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        }
        keepIds.push(entryId);
        entryByInput.set(line.inputId, entryId);

        const prev = getTechFinanceRowById(entryId);
        const createdAt = prev?.createdAt || new Date().toISOString();
        const desc = buildRevenueEntryDescription(line);

        saveTechFinanceEntryLocal(
          {
            id: entryId,
            kind: 'revenue',
            amount: line.amount,
            currency: 'BRL',
            description: desc,
            category_key: null,
            taskId: taskId || null,
            templateId: templateId || null,
            fieldId: field.id,
            scopeSuffix,
            source: 'checklist',
            createdAt,
            owner_email: ownerEmail,
          },
          ownerEmail
        );
      }

      deleteTechFinanceEntriesExceptIds(ownerEmail, taskId, field.id, scopeSuffix, keepIds);

      const outLines: TechnicianRevenueIntLine[] = integ.lines.map((l) => {
        const eid = entryByInput.get(l.inputId);
        if (l.decision === 'accepted' && l.amount > 0 && eid) {
          return { ...l, entryId: eid, decision: 'accepted' };
        }
        return { ...l, entryId: l.entryId };
      });

      const next = JSON.stringify({
        v: 2,
        source: 'technician_revenue_integration',
        lines: outLines,
        financeAppliedRev: R,
      });
      write(next);
      return;
    }

    const parsed = parseTechnicianFinanceValue(raw);
    if (parsed.financeAppliedRev != null && parsed.financeAppliedRev === R) return;

    let linesToApply = parsed.lines.filter((l) => l.kind === 'expense');

    const scopeSuffix = rowSuffix || '';
    const keepIds: string[] = [];
    const nextLines: FinanceLine[] = [];

    for (const line of linesToApply) {
      let entryId = line.entryId && String(line.entryId).trim() ? String(line.entryId).trim() : '';
      if (!entryId) {
        entryId = `tech_fin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      }
      keepIds.push(entryId);
      nextLines.push({ ...line, entryId });

      const prev = getTechFinanceRowById(entryId);
      const createdAt = prev?.createdAt || new Date().toISOString();

      saveTechFinanceEntryLocal(
        {
          id: entryId,
          kind: line.kind,
          amount: line.amount,
          currency: 'BRL',
          description: line.description,
          category_key:
            line.kind === 'expense' && line.categoryKey != null && String(line.categoryKey).trim() !== ''
              ? String(line.categoryKey).trim()
              : null,
          taskId: taskId || null,
          templateId: templateId || null,
          fieldId: field.id,
          scopeSuffix,
          source: 'checklist',
          createdAt,
          owner_email: ownerEmail,
        },
        ownerEmail
      );
    }

    deleteTechFinanceEntriesExceptIds(ownerEmail, taskId, field.id, scopeSuffix, keepIds);

    const next = JSON.stringify({
      v: 1,
      lines: nextLines,
      financeAppliedRev: R,
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
          if (!isTechnicianFinanceFieldType(effectiveSchemaFieldType(f))) continue;
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
            if (!isTechnicianFinanceFieldType(effectiveSchemaFieldType(f))) continue;
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
          if (!isTechnicianFinanceFieldType(effectiveSchemaFieldType(f))) continue;
          await runProcess(f, () => responses[f.id], (json) => { responses[f.id] = json; }, '');
        }
      }
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Erro ao registar custos do técnico.' };
  }
}
