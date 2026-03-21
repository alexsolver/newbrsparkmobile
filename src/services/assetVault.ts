/**
 * AssetVault — Cofre de Senhas e Acessos por Ativo
 * Dados são armazenados em AsyncStorage com chave por ativo.
 * Em produção: substituir por expo-secure-store ou AES local.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

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

const KEY = (assetId: string) => `@vault:asset:${assetId}`;

export const AssetVaultService = {
  async getEntries(assetId: string): Promise<VaultEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(KEY(assetId));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  async saveEntry(assetId: string, entry: Omit<VaultEntry, 'id' | 'lastUpdated'>): Promise<VaultEntry> {
    const entries = await this.getEntries(assetId);
    const newEntry: VaultEntry = {
      ...entry,
      id: `vault_${Date.now()}`,
      lastUpdated: Date.now(),
    };
    await AsyncStorage.setItem(KEY(assetId), JSON.stringify([...entries, newEntry]));
    return newEntry;
  },

  async updateEntry(assetId: string, entryId: string, patch: Partial<VaultEntry>): Promise<void> {
    const entries = await this.getEntries(assetId);
    const updated = entries.map(e => e.id === entryId ? { ...e, ...patch, lastUpdated: Date.now() } : e);
    await AsyncStorage.setItem(KEY(assetId), JSON.stringify(updated));
  },

  async deleteEntry(assetId: string, entryId: string): Promise<void> {
    const entries = await this.getEntries(assetId);
    const filtered = entries.filter(e => e.id !== entryId);
    await AsyncStorage.setItem(KEY(assetId), JSON.stringify(filtered));
  },
};
