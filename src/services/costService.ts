import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { DirectExpense, AssetBudget, CostSummary, RecurringCost } from '../types/costs';
import { StockService } from './stockService';

const KEYS = {
  EXPENSES: 'brspark_costs_expenses',
  BUDGETS: 'brspark_costs_budgets',
  RECURRING: 'brspark_costs_recurring'
};

export const CostService = {
  getExpenses: async (): Promise<DirectExpense[]> => {
    const data = await AsyncStorage.getItem(KEYS.EXPENSES);
    return data ? JSON.parse(data) : [];
  },

  saveExpense: async (expense: DirectExpense) => {
    const all = await CostService.getExpenses();
    const idx = all.findIndex(e => e.id === expense.id);
    if (idx > -1) all[idx] = expense;
    else all.push(expense);
    await AsyncStorage.setItem(KEYS.EXPENSES, JSON.stringify(all));
  },

  getRecurringCosts: async (): Promise<RecurringCost[]> => {
    const data = await AsyncStorage.getItem(KEYS.RECURRING);
    return data ? JSON.parse(data) : [];
  },

  saveRecurringCost: async (cost: RecurringCost) => {
    const all = await CostService.getRecurringCosts();
    const idx = all.findIndex(c => c.id === cost.id);
    if (idx > -1) all[idx] = cost;
    else all.push(cost);
    await AsyncStorage.setItem(KEYS.RECURRING, JSON.stringify(all));
    
    // Agendar Notificação
    if (cost.alertDaysBefore !== undefined) {
      await CostService.scheduleRecurringNotification(cost);
    }
  },

  deleteRecurringCost: async (id: string) => {
    const all = await CostService.getRecurringCosts();
    const filtered = all.filter(c => c.id !== id);
    await AsyncStorage.setItem(KEYS.RECURRING, JSON.stringify(filtered));
    await Notifications.cancelScheduledNotificationAsync(id);
  },

  getBudgets: async (): Promise<AssetBudget[]> => {
    const data = await AsyncStorage.getItem(KEYS.BUDGETS);
    return data ? JSON.parse(data) : [];
  },

  saveBudget: async (budget: AssetBudget) => {
    const all = await CostService.getBudgets();
    const idx = all.findIndex(b => b.assetId === budget.assetId && b.category === budget.category);
    if (idx > -1) all[idx] = budget;
    else all.push(budget);
    await AsyncStorage.setItem(KEYS.BUDGETS, JSON.stringify(all));
  },

  getAssetCostSummary: async (assetId: string, month: string): Promise<CostSummary> => {
    const allExpenses = await CostService.getExpenses();
    const allMovements = await StockService.getMovements();
    const allItems = await StockService.getItems();
    const allBudgets = await CostService.getBudgets();

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

  markRecurringAsPaid: async (id: string): Promise<void> => {
    const allRecurring = await CostService.getRecurringCosts();
    const idx = allRecurring.findIndex(r => r.id === id);
    if (idx === -1) return;

    const recurring = allRecurring[idx];
    
    // 1. Criar a despesa direta correspondente
    const newExpense: DirectExpense = {
      id: Math.random().toString(36).substring(7),
      assetId: recurring.assetId,
      description: `PAGTO: ${recurring.description}`,
      amount: recurring.amount,
      date: recurring.nextDueDate,
      category: 'CONTAS',
      status: 'PAID',
      type: recurring.type || 'EXPENSE'
    };
    await CostService.saveExpense(newExpense);

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
    
    allRecurring[idx] = recurring;
    await AsyncStorage.setItem(KEYS.RECURRING, JSON.stringify(allRecurring));

    // Atualizar Notificação
    if (recurring.alertDaysBefore !== undefined) {
      await CostService.scheduleRecurringNotification(recurring);
    }
  },

  scheduleRecurringNotification: async (cost: RecurringCost) => {
    await Notifications.cancelScheduledNotificationAsync(cost.id);
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
          body: `Vencimento em ${cost.nextDueDate}. Valor: R$ ${cost.amount.toFixed(2)}.`,
          data: { costId: cost.id, assetId: cost.assetId },
        },
        trigger: { date: alertDate } as any,
      });
    }
  }
};


