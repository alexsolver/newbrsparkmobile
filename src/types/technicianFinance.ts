export type TechnicianFinanceKind = 'expense' | 'revenue';

/** Anexos: após sync, `uri` costuma ser URL https do storage; antes disso pode ser ficheiro local. */
export type TechnicianFinanceAttachment = {
  uri: string;
  name?: string;
  mimeType?: string;
};

export type TechnicianFinanceEntry = {
  id: string;
  kind: TechnicianFinanceKind;
  amount: number;
  currency: string;
  description?: string;
  /** Despesas manuais podem ligar-se a várias OS com campo «custos do técnico» no formulário. */
  linkedTaskIds?: string[];
  taskId?: string | null;
  templateId?: string | null;
  fieldId?: string | null;
  scopeSuffix?: string;
  source: 'manual' | 'checklist';
  createdAt: string;
  attachments?: TechnicianFinanceAttachment[];
  /**
   * Quando true (ex.: devolvido pelo escritório via sync), o técnico pode alterar valor, descrição e anexos
   * desde que todas as OS do rateio estejam no telemóvel. Após guardar, volta a false.
   */
  financeValueUnlocked?: boolean;
  /**
   * Mesmo valor em todas as linhas de um rateio manual (estável após sync; o `id` por linha pode mudar).
   */
  splitGroupId?: string | null;
};
