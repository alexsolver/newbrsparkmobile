import { AuthService } from './auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { DirectExpense, AssetBudget, CostSummary, RecurringCost } from '../types/costs';
import { StockService } from './stockService';
import { formatCurrency, formatDate } from '../i18n/formatters';
const GET_KEYS = (email: string) => ({
  EXPENSES: AuthService.getUserKey('costs_expenses', email),
  BUDGETS: AuthService.getUserKey('costs_budgets', email),
  RECURRING: AuthService.getUserKey('costs_recurring', email)
});

const safeParse = (data: string | null, fallback: any = []) => {
  if (!data) return fallback;
  try { return JSON.parse(data); } catch { return fallback; }
};

export const CostService = {
  getExpenses: async (ownerEmail?: string): Promise<DirectExpense[]> => {
    if (!ownerEmail) return [];
    const keys = GET_KEYS(ownerEmail);
    const data = await AsyncStorage.getItem(keys.EXPENSES);
    return safeParse(data);
  },

  saveExpense: async (expense: DirectExpense, ownerEmail: string) => {
    if (!ownerEmail) throw new Error("Usuário não autenticado para salvar despesa.");
    const keys = GET_KEYS(ownerEmail);
    const all = await AsyncStorage.getItem(keys.EXPENSES).then(d => safeParse(d));
    const toSave = { ...expense, ownerEmail };
    const idx = all.findIndex((e: DirectExpense) => e.id === toSave.id);
    if (idx > -1) all[idx] = toSave; else all.push(toSave);
    await AsyncStorage.setItem(keys.EXPENSES, JSON.stringify(all));
  },

  deleteExpense: async (id: string, ownerEmail: string) => {
    const keys = GET_KEYS(ownerEmail);
    const data = await AsyncStorage.getItem(keys.EXPENSES);
    const all: DirectExpense[] = safeParse(data);
    await AsyncStorage.setItem(keys.EXPENSES, JSON.stringify(all.filter(e => e.id !== id)));
  },

  markAsRealized: async (id: string, ownerEmail: string): Promise<void> => {
    const keys = GET_KEYS(ownerEmail);
    const data = await AsyncStorage.getItem(keys.EXPENSES);
    const all: DirectExpense[] = safeParse(data);
    const idx = all.findIndex(e => e.id === id);
    if (idx === -1) return;
    all[idx] = { ...all[idx], status: 'PAID', paidAt: new Date().toISOString().split('T')[0] };
    await AsyncStorage.setItem(keys.EXPENSES, JSON.stringify(all));
  },

  getRecurringCosts: async (ownerEmail?: string): Promise<RecurringCost[]> => {
    if (!ownerEmail) return [];
    const keys = GET_KEYS(ownerEmail);
    const data = await AsyncStorage.getItem(keys.RECURRING);
    return safeParse(data);
  },

  saveRecurringCost: async (cost: RecurringCost, ownerEmail: string) => {
    if (!ownerEmail) throw new Error("Usuário não autenticado para salvar custo recorrente.");
    const keys = GET_KEYS(ownerEmail);
    const all = await AsyncStorage.getItem(keys.RECURRING).then(d => safeParse(d));
    const toSave = { ...cost, ownerEmail };
    const idx = all.findIndex((c: RecurringCost) => c.id === toSave.id);
    if (idx > -1) all[idx] = toSave; else all.push(toSave);
    await AsyncStorage.setItem(keys.RECURRING, JSON.stringify(all));
    if (toSave.alertDaysBefore !== undefined) {
      await CostService.scheduleRecurringNotification(toSave);
    }
  },

  deleteRecurringCost: async (id: string, ownerEmail: string) => {
    const keys = GET_KEYS(ownerEmail);
    const data = await AsyncStorage.getItem(keys.RECURRING);
    const all: RecurringCost[] = safeParse(data);
    const filtered = all.filter(c => c.id !== id);
    await AsyncStorage.setItem(keys.RECURRING, JSON.stringify(filtered));
    try { await Notifications.cancelScheduledNotificationAsync(id); } catch (_) {}
  },

  getBudgets: async (ownerEmail?: string): Promise<AssetBudget[]> => {
    if (!ownerEmail) return [];
    const keys = GET_KEYS(ownerEmail);
    const data = await AsyncStorage.getItem(keys.BUDGETS);
    return safeParse(data);
  },

  saveBudget: async (budget: AssetBudget, ownerEmail: string) => {
    const keys = GET_KEYS(ownerEmail);
    const all = await AsyncStorage.getItem(keys.BUDGETS).then(d => safeParse(d));
    const toSave = { ...budget, ownerEmail };
    const idx = all.findIndex((b: AssetBudget) => b.assetId === toSave.assetId && b.category === toSave.category);
    if (idx > -1) all[idx] = toSave; else all.push(toSave);
    await AsyncStorage.setItem(keys.BUDGETS, JSON.stringify(all));
  },

  getAssetCostSummary: async (assetId: string, month: string, ownerEmail?: string): Promise<CostSummary> => {
    const allExpenses = await CostService.getExpenses(ownerEmail);
    const allMovements = await StockService.getMovements(ownerEmail);
    const allItems = await StockService.getItems(ownerEmail);
    const allBudgets = await CostService.getBudgets(ownerEmail);

    // 1. Despesas Diretas vs Receitas (OpEx / Income)
    const directRecords = allExpenses.filter(e => e.assetId === assetId && e.date.startsWith(month));
    const directExpenses = directRecords.filter(r => r.type === 'EXPENSE').reduce((acc, curr) => acc + curr.amount, 0);
    const totalRevenues = directRecords.filter(r => r.type === 'REVENUE').reduce((acc, curr) => acc + curr.amount, 0);

    // 2. Consumo de Estoque (Stock Consumption) - Sempre uma despesa
    const consumption = allMovements
      .filter(m => {
        const item = allItems.find(i => i.id === m.itemId);
        const matchAsset = m.assetId === assetId || item?.locationId === assetId;
        return m.type === 'OUT' && matchAsset && m.timestamp.startsWith(month);
      })
      .reduce((acc, m) => {
        const item = allItems.find(i => i.id === m.itemId);
        const price = m.unitPrice || item?.costPrice || 0;
        return acc + (m.quantity * price);
      }, 0);

    // 3. Valor Total em Estoque
    const stockValue = allItems
      .filter(i => i.locationId === assetId)
      .reduce((acc, i) => acc + (i.currentStock * (i.costPrice || 0)), 0);

    // 4. Budget Total
    const budget = allBudgets
      .filter(b => b.assetId === assetId)
      .reduce((acc, b) => acc + b.monthlyLimit, 0);

    return {
      assetId,
      period: month,
      totalStockValue: stockValue,
      totalConsumptionValue: consumption,
      totalExpenses: directExpenses + consumption,
      totalRevenues: totalRevenues,
      totalBudget: budget
    };
  },

  /** Aggregates cost summary across multiple asset IDs (parent + children) */
  getConsolidatedSummary: async (assetIds: string[], month: string, ownerEmail?: string): Promise<CostSummary> => {
    const summaries = await Promise.all(assetIds.map(id => CostService.getAssetCostSummary(id, month, ownerEmail)));
    return {
      assetId: assetIds[0],
      period: month,
      totalStockValue:      summaries.reduce((a, s) => a + s.totalStockValue, 0),
      totalConsumptionValue: summaries.reduce((a, s) => a + s.totalConsumptionValue, 0),
      totalExpenses:         summaries.reduce((a, s) => a + s.totalExpenses, 0),
      totalRevenues:         summaries.reduce((a, s) => a + s.totalRevenues, 0),
      totalBudget:           summaries.reduce((a, s) => a + s.totalBudget, 0),
    };
  },

  markRecurringAsPaid: async (id: string, ownerEmail: string): Promise<void> => {
    const allRecurring = await CostService.getRecurringCosts(ownerEmail);
    const idx = allRecurring.findIndex(r => r.id === id);
    if (idx === -1) return;

    const recurring = allRecurring[idx];
    
    // 1. Criar a despesa direta correspondente
    const newExpense: DirectExpense = {
      id: `rc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`,
      assetId: recurring.assetId,
      description: `PAGTO: ${recurring.description}`,
      amount: recurring.amount,
      date: recurring.nextDueDate,
      category: 'CONTAS',
      status: 'PAID',
      type: recurring.type || 'EXPENSE'
    };
    await CostService.saveExpense(newExpense, ownerEmail);

    // 2. Calcular a próxima data de vencimento
    const currentDate = new Date(recurring.nextDueDate);
    if (isNaN(currentDate.getTime())) return;

    if (recurring.frequency === 'MONTHLY') {
      currentDate.setMonth(currentDate.getMonth() + 1);
    } else if (recurring.frequency === 'WEEKLY') {
      currentDate.setDate(currentDate.getDate() + 7);
    } else if (recurring.frequency === 'YEARLY') {
      currentDate.setFullYear(currentDate.getFullYear() + 1);
    }
    
    recurring.nextDueDate = currentDate.toISOString().split('T')[0];
    recurring.lastPaidAt = new Date().toISOString().split('T')[0];
    
    // 3. Gerenciar Parcelas (Series)
    if (recurring.remainingInstallments !== undefined) {
      recurring.remainingInstallments -= 1;
      if (recurring.remainingInstallments <= 0) {
        recurring.status = 'PAUSED'; // Finaliza a série
      }
    }

    const keys = GET_KEYS(ownerEmail);
    allRecurring[idx] = recurring;
    await AsyncStorage.setItem(keys.RECURRING, JSON.stringify(allRecurring));

    // Atualizar Notificação
    if (recurring.alertDaysBefore !== undefined) {
      try { await CostService.scheduleRecurringNotification(recurring); } catch (_) {}
    }
  },

  /** Anticipate a recurring cost: create a PENDING direct record and advance date */
  anticipateRecurring: async (id: string, ownerEmail: string): Promise<void> => {
    const allRecurring = await CostService.getRecurringCosts(ownerEmail);
    const idx = allRecurring.findIndex(r => r.id === id);
    if (idx === -1) return;

    const recurring = allRecurring[idx];
    
    // 1. Criar a despesa direta como PENDENTE
    const newRecord: DirectExpense = {
      id: `rc-ant-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`,
      assetId: recurring.assetId,
      description: `ANTECIPAÇÃO: ${recurring.description}`,
      amount: recurring.amount,
      date: recurring.nextDueDate,
      category: 'CONTAS',
      status: 'PENDING',
      type: recurring.type || 'EXPENSE'
    };
    await CostService.saveExpense(newRecord, ownerEmail);

    // 2. Calcular a próxima data de vencimento
    const currentDate = new Date(recurring.nextDueDate);
    if (isNaN(currentDate.getTime())) return;

    if (recurring.frequency === 'MONTHLY') {
      currentDate.setMonth(currentDate.getMonth() + 1);
    } else if (recurring.frequency === 'WEEKLY') {
      currentDate.setDate(currentDate.getDate() + 7);
    } else if (recurring.frequency === 'YEARLY') {
      currentDate.setFullYear(currentDate.getFullYear() + 1);
    }
    
    recurring.nextDueDate = currentDate.toISOString().split('T')[0];
    
    // Atualizar Série
    if (recurring.remainingInstallments !== undefined) {
      recurring.remainingInstallments -= 1;
      if (recurring.remainingInstallments <= 0) {
        recurring.status = 'PAUSED';
      }
    }

    const keys = GET_KEYS(ownerEmail);
    allRecurring[idx] = recurring;
    await AsyncStorage.setItem(keys.RECURRING, JSON.stringify(allRecurring));

    // Atualizar Notificação
    if (recurring.alertDaysBefore !== undefined) {
      try { await CostService.scheduleRecurringNotification(recurring); } catch (_) {}
    }
  },

  scheduleRecurringNotification: async (cost: RecurringCost) => {
    if (!cost.id) return;
    try { await Notifications.cancelScheduledNotificationAsync(cost.id); } catch (_) {}
    if (cost.status !== 'ACTIVE' || !cost.nextDueDate || cost.alertDaysBefore === undefined) return;

    const dueDate = new Date(cost.nextDueDate);
    const alertDate = new Date(dueDate.getTime());
    alertDate.setDate(alertDate.getDate() - cost.alertDaysBefore);
    alertDate.setHours(9, 0, 0, 0);

    if (alertDate > new Date()) {
      await Notifications.scheduleNotificationAsync({
        identifier: cost.id,
        content: {
          title: `💰 Conta Próxima: ${cost.description}`,
          body: `Vencimento em ${formatDate(cost.nextDueDate)}. Valor: ${formatCurrency(cost.amount)}.`,
          data: { costId: cost.id, assetId: cost.assetId },
        },
        trigger: { date: alertDate } as any,
      });
    }
  }
};
