import { getTechnicianExpenseCategories } from '../database';
import { TECHNICIAN_EXPENSE_CATEGORIES_FALLBACK } from '../constants/technicianExpenseCategoriesFallback';

export type TechnicianExpenseCategoryRow = {
  id: string;
  label: string;
  icon?: string;
  color?: string;
};

export function loadTechnicianExpenseCategoryCatalog(): TechnicianExpenseCategoryRow[] {
  const rows = getTechnicianExpenseCategories();
  if (rows.length > 0) {
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      icon: r.icon || undefined,
      color: r.color || undefined,
    }));
  }
  return TECHNICIAN_EXPENSE_CATEGORIES_FALLBACK.map((c) => ({ ...c }));
}

export function labelForTechnicianExpenseCategory(
  catalog: TechnicianExpenseCategoryRow[],
  key?: string | null
): string | null {
  if (key == null || String(key).trim() === '') return null;
  const k = String(key).trim();
  const hit = catalog.find((c) => c.id === k);
  return hit?.label || k;
}
