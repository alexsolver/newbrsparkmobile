import AsyncStorage from '@react-native-async-storage/async-storage';
import { InsuranceService } from './insuranceService';
import { CostService } from './costService';
import { StockService } from './stockService';
import { AssetDocService } from './assetDocs';
import { InsurancePolicy, POLICY_TYPE_LABELS } from '../types/insurance';
import { DirectExpense, RecurringCost } from '../types/costs';
import { StockItem } from '../types/stock';
import { formatCurrency } from '../i18n/formatters';
import i18n from '../i18n';

// ─── Types ───
export interface AssetInsight {
  id: string;
  type: 'warning' | 'danger' | 'success' | 'info';
  icon: string;
  title: string;
  description: string;
  priority: number; // 1 = highest
}

export interface AssetHealthScore {
  overall: number;        // 0-100
  insurance: number;
  costs: number;
  stock: number;
  documentation: number;
}

export interface AssetDataSnapshot {
  assetId: string;
  assetType: string;
  // Insurance
  policies: InsurancePolicy[];
  activePolicies: number;
  expiringPolicies: number;
  expiredPolicies: number;
  totalPremium: number;
  // Costs
  expenses: DirectExpense[];
  recurringCosts: RecurringCost[];
  totalExpenses3m: number;
  avgMonthlyExpense: number;
  // Stock
  stockItems: StockItem[];
  lowStockItems: number;
  totalStockValue: number;
  // Docs
  totalDocuments: number;
  // Computed
  insights: AssetInsight[];
  healthScore: AssetHealthScore;
}

// ─── Data Aggregation ───
export const AssetAIService = {

  async aggregateAssetData(assetId: string, assetType: string, ownerEmail?: string): Promise<AssetDataSnapshot> {
    // 1. Insurance
    const policies = await InsuranceService.getPolicies(assetId, ownerEmail);
    const activePolicies = policies.filter(p => p.status === 'ACTIVE').length;
    const expiringPolicies = policies.filter(p => p.status === 'EXPIRING_SOON').length;
    const expiredPolicies = policies.filter(p => p.status === 'EXPIRED').length;
    const totalPremium = policies.reduce((s, p) => s + (p.premiumValue || 0), 0);

    // 2. Costs
    const allExpenses = await CostService.getExpenses(ownerEmail);
    const expenses = allExpenses.filter(e => e.assetId === assetId);
    const recurringCosts = (await CostService.getRecurringCosts(ownerEmail)).filter(r => r.assetId === assetId);

    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const recentExpenses = expenses.filter(e => new Date(e.date) >= threeMonthsAgo && e.type === 'EXPENSE');
    const totalExpenses3m = recentExpenses.reduce((s, e) => s + e.amount, 0);
    const avgMonthlyExpense = totalExpenses3m / 3;

    // 3. Stock
    const allItems = await StockService.getItems(ownerEmail);
    const stockItems = allItems.filter(i => i.locationId === assetId);
    const lowStockItems = stockItems.filter(i => i.currentStock <= (i.minStock || 0)).length;
    const totalStockValue = stockItems.reduce((s, i) => s + (i.currentStock * (i.costPrice || 0)), 0);

    // 4. Docs
    const docs = await AssetDocService.getDocuments(assetId, ownerEmail);
    const totalDocuments = docs.length;

    // 5. Generate insights
    const snapshot: AssetDataSnapshot = {
      assetId, assetType,
      policies, activePolicies, expiringPolicies, expiredPolicies, totalPremium,
      expenses, recurringCosts, totalExpenses3m, avgMonthlyExpense,
      stockItems, lowStockItems, totalStockValue,
      totalDocuments,
      insights: [],
      healthScore: { overall: 0, insurance: 0, costs: 0, stock: 0, documentation: 0 },
    };

    snapshot.insights = this.generateLocalInsights(snapshot);
    snapshot.healthScore = this.calculateHealthScore(snapshot);

    return snapshot;
  },

  // ─── Local Insights Engine (FREE) ───
  generateLocalInsights(data: AssetDataSnapshot): AssetInsight[] {
    const insights: AssetInsight[] = [];

    // Insurance insights
    if (data.policies.length === 0) {
      insights.push({
        id: 'ins_none', type: 'danger', icon: 'shield-outline',
        title: i18n.t('ai.noInsurance'),
        description: i18n.t('ai.noInsuranceDesc'),
        priority: 1,
      });
    }
    if (data.expiredPolicies > 0) {
      insights.push({
        id: 'ins_expired', type: 'danger', icon: 'alert-circle',
        title: i18n.t('ai.expiredPolicies', { count: data.expiredPolicies }),
        description: i18n.t('ai.expiredPoliciesDesc'),
        priority: 1,
      });
    }
    if (data.expiringPolicies > 0) {
      const soonest = data.policies
        .filter(p => p.status === 'EXPIRING_SOON')
        .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())[0];
      const days = soonest ? InsuranceService.daysRemaining(soonest.endDate) : 0;
      insights.push({
        id: 'ins_expiring', type: 'warning', icon: 'time-outline',
        title: i18n.t('ai.insuranceExpiring', { days }),
        description: `${POLICY_TYPE_LABELS[soonest?.type || 'OTHER']} — ${soonest?.insurer || ''} (${days}d)`,
        priority: 2,
      });
    }
    if (data.activePolicies > 0 && data.expiredPolicies === 0 && data.expiringPolicies === 0) {
      insights.push({
        id: 'ins_ok', type: 'success', icon: 'shield-checkmark',
        title: i18n.t('ai.insuranceOk'),
        description: `${data.activePolicies} ${i18n.t('ai.activePolicies')} — ${InsuranceService.formatCurrency(data.totalPremium)}/${i18n.t('common.year')}.`,
        priority: 8,
      });
    }

    // Stock insights
    if (data.lowStockItems > 0) {
      insights.push({
        id: 'stock_low', type: 'warning', icon: 'cube-outline',
        title: i18n.t('ai.lowStock', { count: data.lowStockItems }),
        description: i18n.t('ai.lowStockDesc'),
        priority: 2,
      });
    }
    if (data.stockItems.length > 0 && data.lowStockItems === 0) {
      insights.push({
        id: 'stock_ok', type: 'success', icon: 'cube',
        title: i18n.t('ai.healthyStock'),
        description: `${data.stockItems.length} item(s) — ${InsuranceService.formatCurrency(data.totalStockValue)}.`,
        priority: 9,
      });
    }

    // Cost insights
    if (data.avgMonthlyExpense > 0) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const thisMonthExpenses = data.expenses
        .filter(e => e.date.startsWith(currentMonth) && e.type === 'EXPENSE')
        .reduce((s, e) => s + e.amount, 0);

      if (thisMonthExpenses > data.avgMonthlyExpense * 1.3) {
        const pct = Math.round(((thisMonthExpenses / data.avgMonthlyExpense) - 1) * 100);
        insights.push({
          id: 'cost_high', type: 'warning', icon: 'trending-up',
          title: i18n.t('ai.costsAbove', { pct }),
          description: `${InsuranceService.formatCurrency(thisMonthExpenses)} vs ${InsuranceService.formatCurrency(data.avgMonthlyExpense)}/${i18n.t('common.month')}.`,
          priority: 3,
        });
      } else {
        insights.push({
          id: 'cost_ok', type: 'info', icon: 'wallet-outline',
          title: i18n.t('ai.tcoControlled'),
          description: `${InsuranceService.formatCurrency(data.avgMonthlyExpense)}/${i18n.t('common.month')} — ${InsuranceService.formatCurrency(data.totalExpenses3m)} (3m).`,
          priority: 7,
        });
      }
    }

    // Recurring costs due soon
    const pendingRecurring = data.recurringCosts.filter(r => {
      if (r.status !== 'ACTIVE') return false;
      const days = InsuranceService.daysRemaining(r.nextDueDate);
      return days >= 0 && days <= (r.alertDaysBefore ?? 5);
    });
    if (pendingRecurring.length > 0) {
      insights.push({
        id: 'cost_due', type: 'warning', icon: 'cash-outline',
        title: i18n.t('ai.billsDue', { count: pendingRecurring.length }),
        description: pendingRecurring.map(r => `${r.description}: ${InsuranceService.formatCurrency(r.amount)}`).join(', '),
        priority: 2,
      });
    }

    // Doc insights
    if (data.totalDocuments === 0) {
      insights.push({
        id: 'doc_none', type: 'info', icon: 'document-outline',
        title: i18n.t('ai.noDocuments'),
        description: i18n.t('ai.noDocumentsDesc'),
        priority: 6,
      });
    }

    // Sort by priority
    return insights.sort((a, b) => a.priority - b.priority);
  },

  // ─── Health Score Calculator ───
  calculateHealthScore(data: AssetDataSnapshot): AssetHealthScore {
    let insurance = 100;
    if (data.policies.length === 0) insurance = 0;
    else {
      if (data.expiredPolicies > 0) insurance -= 50;
      if (data.expiringPolicies > 0) insurance -= 20;
    }

    let costs = 80; // baseline
    if (data.avgMonthlyExpense > 0) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const thisMonth = data.expenses
        .filter(e => e.date.startsWith(currentMonth) && e.type === 'EXPENSE')
        .reduce((s, e) => s + e.amount, 0);
      if (thisMonth > data.avgMonthlyExpense * 1.5) costs = 40;
      else if (thisMonth > data.avgMonthlyExpense * 1.2) costs = 60;
    }

    let stock = 100;
    if (data.stockItems.length > 0) {
      const lowRatio = data.lowStockItems / data.stockItems.length;
      stock = Math.round(100 * (1 - lowRatio));
    }

    let documentation = data.totalDocuments > 0 ? 80 : 30;

    const overall = Math.round(
      insurance * 0.35 +
      costs * 0.30 +
      stock * 0.20 +
      documentation * 0.15
    );

    return {
      overall: Math.max(0, Math.min(100, overall)),
      insurance: Math.max(0, Math.min(100, insurance)),
      costs: Math.max(0, Math.min(100, costs)),
      stock: Math.max(0, Math.min(100, stock)),
      documentation: Math.max(0, Math.min(100, documentation)),
    };
  },

  // ─── Build LLM Context (PREMIUM) ───
  buildLLMContext(data: AssetDataSnapshot): string {
    const lines: string[] = [];
    lines.push(`## Dados do Ativo (ID: ${data.assetId}, Tipo: ${data.assetType})`);
    lines.push('');

    // Insurance summary
    lines.push(`### Seguros`);
    lines.push(`- Total apólices: ${data.policies.length} (${data.activePolicies} ativas, ${data.expiringPolicies} vencendo, ${data.expiredPolicies} vencidas)`);
    lines.push(`- Prêmio total anual: ${formatCurrency(data.totalPremium)}`);
    data.policies.forEach(p => {
      const days = InsuranceService.daysRemaining(p.endDate);
      lines.push(`  - ${POLICY_TYPE_LABELS[p.type]} (${p.insurer}): ${p.status}, vence em ${days}d, prêmio ${formatCurrency(p.premiumValue)}, franquia ${formatCurrency(p.deductible)}`);
    });
    lines.push('');

    // Costs summary
    lines.push(`### Custos`);
    lines.push(`- Média mensal (3m): ${formatCurrency(data.avgMonthlyExpense)}`);
    lines.push(`- Total últimos 3 meses: ${formatCurrency(data.totalExpenses3m)}`);
    lines.push(`- Custos recorrentes ativos: ${data.recurringCosts.filter(r => r.status === 'ACTIVE').length}`);
    lines.push('');

    // Stock summary
    lines.push(`### Estoque`);
    lines.push(`- Total itens: ${data.stockItems.length}, Estoque baixo: ${data.lowStockItems}`);
    lines.push(`- Valor total em estoque: ${formatCurrency(data.totalStockValue)}`);
    lines.push('');

    // Docs
    lines.push(`### Documentos`);
    lines.push(`- Total documentos: ${data.totalDocuments}`);
    lines.push('');

    // Health
    const h = data.healthScore;
    lines.push(`### Score de Saúde`);
    lines.push(`- Geral: ${h.overall}/100, Seguro: ${h.insurance}, Custos: ${h.costs}, Estoque: ${h.stock}, Docs: ${h.documentation}`);

    return lines.join('\n');
  },
};
