/**
 * AssetVault — Cofre de Senhas e Acessos por Ativo
 * Dados são armazenados em AsyncStorage com chave por ativo.
 * Em produção: substituir por expo-secure-store ou AES local.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueueMutation } from './syncService';
import { AuthService } from './auth';

export type VaultCategory =
  | 'wifi'
  | 'camera'
  | 'lock'
  | 'user_pass'
  | 'alarm'
  | 'gate'
  | 'safe'
  | 'server'
  | 'email'
  | 'other';

export interface VaultEntry {
  id: string;
  category: VaultCategory;
  label: string;          // ex: "Wi-Fi Principal", "Cancela Garagem"
  username?: string;
  password: string;
  note?: string;
  lastUpdated: number;
  ownerEmail?: string;
}

export const VAULT_CATEGORIES: Record<VaultCategory, { label: string; icon: string; color: string }> = {
  wifi:      { label: 'Wi-Fi',          icon: 'wifi',                    color: '#3B82F6' },
  camera:    { label: 'Câmera',         icon: 'videocam',                color: '#6366F1' },
  lock:      { label: 'Fechadura',      icon: 'lock-closed',             color: '#F59E0B' },
  user_pass: { label: 'Usuário/Senha',  icon: 'person-circle',           color: '#10B981' },
  alarm:     { label: 'Alarme',         icon: 'notifications',           color: '#EF4444' },
  gate:      { label: 'Portão/Cancela', icon: 'car',                     color: '#8B5CF6' },
  safe:      { label: 'Cofre Físico',   icon: 'shield-checkmark',        color: '#D97706' },
  server:    { label: 'Servidor/NAS',   icon: 'server',                  color: '#059669' },
  email:     { label: 'E-mail',         icon: 'mail',                    color: '#EC4899' },
  other:     { label: 'Outro',          icon: 'key',                     color: '#64748B' },
};

const KEY = (assetId: string, email: string) => AuthService.getUserKey(`vault:${assetId}`, email);

export const AssetVaultService = {
  async getEntries(assetId: string, ownerEmail?: string): Promise<VaultEntry[]> {
    if (!ownerEmail) return [];
    try {
      const raw = await AsyncStorage.getItem(KEY(assetId, ownerEmail));
      const all: VaultEntry[] = raw ? JSON.parse(raw) : [];
      return all; // No need to filter anymore, key is already isolated
    } catch { return []; }
  },

  async saveEntry(assetId: string, entry: Omit<VaultEntry, 'id' | 'lastUpdated'>, ownerEmail: string): Promise<VaultEntry> {
    if (!ownerEmail) throw new Error('ownerEmail required for vaulted data');
    const entries = await this.getEntries(assetId, ownerEmail);
    const newEntry: VaultEntry = {
      ...entry,
      id: `vault_${Date.now()}`,
      lastUpdated: Date.now(),
      ownerEmail,
    };
    await AsyncStorage.setItem(KEY(assetId, ownerEmail), JSON.stringify([...entries, newEntry]));
    enqueueMutation('vault', 'CREATE', { assetId, entry: newEntry }, ownerEmail);
    return newEntry;
  },

  async updateEntry(assetId: string, entryId: string, patch: Partial<VaultEntry>, ownerEmail: string): Promise<void> {
    if (!ownerEmail) return;
    const entries = await this.getEntries(assetId, ownerEmail);
    const updated = entries.map(e => e.id === entryId ? { ...e, ...patch, lastUpdated: Date.now(), ownerEmail: ownerEmail || e.ownerEmail } : e);
    await AsyncStorage.setItem(KEY(assetId, ownerEmail), JSON.stringify(updated));
    const entryPatch = updated.find(e => e.id === entryId) || patch;
    enqueueMutation('vault', 'UPDATE', { assetId, entryId, patch: entryPatch }, ownerEmail);
  },

  async deleteEntry(assetId: string, entryId: string, ownerEmail: string): Promise<void> {
    if (!ownerEmail) return;
    const entries = await this.getEntries(assetId, ownerEmail);
    const filtered = entries.filter(e => e.id !== entryId);
    await AsyncStorage.setItem(KEY(assetId, ownerEmail), JSON.stringify(filtered));
    enqueueMutation('vault', 'DELETE', { assetId, entryId }, ownerEmail);
  },
};
