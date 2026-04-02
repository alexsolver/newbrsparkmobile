export interface AssetBudget {
  id: string;
  assetId: string;
  monthlyLimit: number;
  category: string; // 'GERAL', 'MANUTENÇÃO', etc.
  ownerEmail?: string;
}

export interface DirectExpense {
  id: string;
  assetId: string;
  category: string; // 'MANUTENÇÃO', 'CONTAS', 'TAXAS', 'VENDA', etc.
  amount: number;
  date: string;
  description: string;
  type: 'EXPENSE' | 'REVENUE';
  provider?: string;
  photoUri?: string;
  status: 'PAID' | 'PENDING';
  paidAt?: string; // ISO date when the record was marked as realized
  ownerEmail?: string;
}

export interface RecurringCost {
  id: string;
  assetId: string;
  description: string;
  amount: number;
  category: string;
  type: 'EXPENSE' | 'REVENUE';
  frequency: 'MONTHLY' | 'YEARLY' | 'WEEKLY';
  nextDueDate: string;
  status: 'ACTIVE' | 'PAUSED';
  lastPaidAt?: string;
  alertDaysBefore?: number; // Ex: 0 (no dia), 1, 5, 10
  totalInstallments?: number;
  remainingInstallments?: number;
  ownerEmail?: string;
}




export interface CostSummary {
  assetId: string;
  period: string; // 'YYYY-MM'
  totalStockValue: number;
  totalConsumptionValue: number;
  totalExpenses: number;
  totalRevenues: number;
  totalBudget: number;
}
