import AsyncStorage from '@react-native-async-storage/async-storage';
import { InsurancePolicy } from '../types/insurance';
import { formatCurrency as i18nFormatCurrency } from '../i18n/formatters';
import { AuthService } from './auth';

const KEY = (email: string) => AuthService.getUserKey('insurance_policies', email);

function calculateStatus(policy: InsurancePolicy): InsurancePolicy['status'] {
  if (policy.status === 'CANCELLED') return 'CANCELLED';
  const now = new Date();
  const end = new Date(policy.endDate);
  const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const alertWindow = policy.alertDaysBefore ?? 30;

  if (diffDays < 0) return 'EXPIRED';
  if (diffDays <= alertWindow) return 'EXPIRING_SOON';
  return 'ACTIVE';
}

function refreshStatuses(policies: InsurancePolicy[]): InsurancePolicy[] {
  return policies.map(p => ({ ...p, status: calculateStatus(p) }));
}

async function getAllPolicies(ownerEmail?: string): Promise<InsurancePolicy[]> {
  if (!ownerEmail) return [];
  const raw = await AsyncStorage.getItem(KEY(ownerEmail));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return refreshStatuses(parsed as InsurancePolicy[]);
  } catch (e) {
    console.warn('[InsuranceService] cache inválido, limpando entrada local:', e);
    await AsyncStorage.removeItem(KEY(ownerEmail)).catch(() => {});
    return [];
  }
}

async function savePolicies(policies: InsurancePolicy[], ownerEmail: string): Promise<void> {
  await AsyncStorage.setItem(KEY(ownerEmail), JSON.stringify(policies));
}

export const InsuranceService = {
  async getPolicies(assetId: string, ownerEmail?: string): Promise<InsurancePolicy[]> {
    if (!ownerEmail) return [];
    const all = await getAllPolicies(ownerEmail);
    return all.filter(p => p.assetId === assetId);
  },

  async savePolicy(policy: InsurancePolicy, ownerEmail: string): Promise<void> {
    if (!ownerEmail) throw new Error("Usuário não autenticado para salvar seguro.");
    const all = await getAllPolicies(ownerEmail);
    const updated = { ...policy, status: calculateStatus(policy), ownerEmail };
    const idx = all.findIndex(p => p.id === updated.id);
    if (idx >= 0) all[idx] = updated; else all.push(updated);
    await savePolicies(all, ownerEmail);
  },

  async deletePolicy(id: string, ownerEmail: string): Promise<void> {
    const all = await getAllPolicies(ownerEmail);
    await savePolicies(all.filter(p => p.id !== id), ownerEmail);
  },

  async getExpiringPolicies(ownerEmail?: string): Promise<InsurancePolicy[]> {
    if (!ownerEmail) return [];
    const all = await getAllPolicies(ownerEmail);
    return all.filter(p => p.status === 'EXPIRING_SOON' || p.status === 'EXPIRED');
  },

  async getAssetInsuranceStatus(assetId: string, ownerEmail?: string): Promise<'ok' | 'warning' | 'danger' | 'none'> {
    const policies = await this.getPolicies(assetId, ownerEmail);
    if (policies.length === 0) return 'none';
    if (policies.some(p => p.status === 'EXPIRED')) return 'danger';
    if (policies.some(p => p.status === 'EXPIRING_SOON')) return 'warning';
    return 'ok';
  },

  daysRemaining(endDate: string): number {
    const end = new Date(endDate);
    const now = new Date();
    return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  },

  formatCurrency(value: number): string {
    return i18nFormatCurrency(value);
  },
};
