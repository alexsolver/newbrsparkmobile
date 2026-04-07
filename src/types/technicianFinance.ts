export type TechnicianFinanceKind = 'expense' | 'revenue';

export type TechnicianFinanceEntry = {
  id: string;
  kind: TechnicianFinanceKind;
  amount: number;
  currency: string;
  description?: string;
  taskId?: string | null;
  templateId?: string | null;
  fieldId?: string | null;
  scopeSuffix?: string;
  source: 'manual' | 'checklist';
  createdAt: string;
};
