// eslint-disable-next-line @typescript-eslint/no-explicit-any
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FamilyMember {
  id: string;
  name: string;
  relationship: string;
  birthDate?: string;
  cpf?: string;
  email?: string;
  phone?: string;
}

export interface FamilyAsset {
  id: string;
  title: string;
  category: 'PROPERTY' | 'VEHICLE' | 'INVESTMENT' | 'INSURANCE' | 'DOCUMENT' | 'PENSION';
  description?: string;
  value?: number;
  beneficiaryId?: string;
  expiryDate?: string;
  institution?: string;
  notes?: string;
  sharedWith?: string[]; // IDs de FamilyMember com acesso
  createdAt: number;
  updatedAt: number;
}

const KEYS = {
  assets:  'brspark_family_assets',
  members: 'brspark_family_members',
};

export async function initFamilyDatabase(): Promise<void> {
  // No-op: AsyncStorage não precisa de init
}

// ─── Family Assets ─────────────────────────────────────────────────────────────
export async function getFamilyAssets(): Promise<FamilyAsset[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.assets);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveFamilyAsset(asset: FamilyAsset): Promise<void> {
  const all = await getFamilyAssets();
  const idx = all.findIndex(a => a.id === asset.id);
  if (idx >= 0) all[idx] = asset; else all.unshift(asset);
  await AsyncStorage.setItem(KEYS.assets, JSON.stringify(all));
}

export async function deleteFamilyAsset(id: string): Promise<void> {
  const all = await getFamilyAssets();
  await AsyncStorage.setItem(KEYS.assets, JSON.stringify(all.filter(a => a.id !== id)));
}

// ─── Family Members ────────────────────────────────────────────────────────────
export async function getFamilyMembers(): Promise<FamilyMember[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.members);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveFamilyMember(member: FamilyMember): Promise<void> {
  const all = await getFamilyMembers();
  const idx = all.findIndex(m => m.id === member.id);
  if (idx >= 0) all[idx] = member; else all.push(member);
  await AsyncStorage.setItem(KEYS.members, JSON.stringify(all));
}

export async function deleteFamilyMember(id: string): Promise<void> {
  const all = await getFamilyMembers();
  await AsyncStorage.setItem(KEYS.members, JSON.stringify(all.filter(m => m.id !== id)));
}
