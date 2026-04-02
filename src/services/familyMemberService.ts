import { AuthService } from './auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MemberDocument {
  id: string;
  memberId: string;
  type: 'RG' | 'CPF' | 'PASSAPORTE' | 'CNH' | 'CERTIDAO_NASCIMENTO' | 'TITULO_ELEITOR' | 'OUTRO';
  label: string;
  imageUri?: string;
  fileUri?: string;
  expiryDate?: string;
  notes?: string;
  createdAt: number;
}

export interface MemberHealth {
  memberId: string;
  bloodType?: string;
  allergies: string[];
  medications: string[];
  conditions: string[];
  healthPlan?: string;
  healthPlanNumber?: string;
  doctorName?: string;
  doctorPhone?: string;
  notes?: string;
}

export interface EmergencyContact {
  id: string;
  memberId: string;
  name: string;
  relationship: string;
  phone: string;
  isMain: boolean;
}

export interface MemberEducation {
  id: string;
  memberId: string;
  institution: string;
  course?: string;
  grade?: string;
  startYear?: string;
  endYear?: string;
  status: 'CURSANDO' | 'CONCLUIDO' | 'TRANCADO';
  notes?: string;
}

export interface MemberNote {
  id: string;
  memberId: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export type SocialPlatform = 'INSTAGRAM' | 'FACEBOOK' | 'TWITTER' | 'LINKEDIN' | 'TIKTOK' | 'YOUTUBE' | 'WHATSAPP' | 'TELEGRAM' | 'OUTRO';

export interface MemberSocial {
  id: string;
  memberId: string;
  platform: SocialPlatform;
  username: string;
  url?: string;
  imageUri?: string;
  notes?: string;
}

export const SOCIAL_PLATFORMS: Record<SocialPlatform, { label: string; icon: string; color: string }> = {
  INSTAGRAM:  { label: 'Instagram',  icon: 'logo-instagram',  color: '#E4405F' },
  FACEBOOK:   { label: 'Facebook',   icon: 'logo-facebook',   color: '#1877F2' },
  TWITTER:    { label: 'X (Twitter)', icon: 'logo-twitter',   color: '#1DA1F2' },
  LINKEDIN:   { label: 'LinkedIn',   icon: 'logo-linkedin',   color: '#0A66C2' },
  TIKTOK:     { label: 'TikTok',     icon: 'logo-tiktok',     color: '#000000' },
  YOUTUBE:    { label: 'YouTube',    icon: 'logo-youtube',    color: '#FF0000' },
  WHATSAPP:   { label: 'WhatsApp',   icon: 'logo-whatsapp',   color: '#25D366' },
  TELEGRAM:   { label: 'Telegram',   icon: 'paper-plane',     color: '#0088CC' },
  OUTRO:      { label: 'Outro',      icon: 'globe-outline',   color: '#6366F1' },
};

export const DOC_TYPE_LABELS: Record<MemberDocument['type'], string> = {
  RG: 'RG',
  CPF: 'CPF',
  PASSAPORTE: 'Passaporte',
  CNH: 'CNH',
  CERTIDAO_NASCIMENTO: 'Certidão de Nascimento',
  TITULO_ELEITOR: 'Título de Eleitor',
  OUTRO: 'Outro',
};

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// ─── Keys ────────────────────────────────────────────────────────────────────
const KEY = (type: string, memberId: string, email: string) => AuthService.getUserKey(`family_member:${type}:${memberId}`, email);

// ─── Service ─────────────────────────────────────────────────────────────────
export const FamilyMemberService = {

  // ── Documents ──
  async getDocuments(memberId: string, ownerEmail?: string): Promise<MemberDocument[]> {
    if (!ownerEmail) return [];
    try {
      const raw = await AsyncStorage.getItem(KEY('docs', memberId, ownerEmail));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  async saveDocument(doc: MemberDocument, ownerEmail: string): Promise<void> {
    const all = await this.getDocuments(doc.memberId, ownerEmail);
    const idx = all.findIndex(d => d.id === doc.id);
    if (idx >= 0) all[idx] = doc; else all.unshift(doc);
    await AsyncStorage.setItem(KEY('docs', doc.memberId, ownerEmail), JSON.stringify(all));
  },

  async deleteDocument(memberId: string, docId: string, ownerEmail: string): Promise<void> {
    const all = await this.getDocuments(memberId, ownerEmail);
    await AsyncStorage.setItem(KEY('docs', memberId, ownerEmail), JSON.stringify(all.filter(d => d.id !== docId)));
  },

  // ── Health ──
  async getHealth(memberId: string, ownerEmail?: string): Promise<MemberHealth> {
    if (!ownerEmail) return {
      memberId, bloodType: '', allergies: [], medications: [], conditions: [],
      healthPlan: '', healthPlanNumber: '', doctorName: '', doctorPhone: '', notes: '',
    };
    try {
      const raw = await AsyncStorage.getItem(KEY('health', memberId, ownerEmail));
      return raw ? JSON.parse(raw) : {
        memberId, bloodType: '', allergies: [], medications: [], conditions: [],
        healthPlan: '', healthPlanNumber: '', doctorName: '', doctorPhone: '', notes: '',
      };
    } catch {
      return {
        memberId, bloodType: '', allergies: [], medications: [], conditions: [],
        healthPlan: '', healthPlanNumber: '', doctorName: '', doctorPhone: '', notes: '',
      };
    }
  },

  async saveHealth(health: MemberHealth, ownerEmail: string): Promise<void> {
    await AsyncStorage.setItem(KEY('health', health.memberId, ownerEmail), JSON.stringify(health));
  },

  // ── Emergency Contacts ──
  async getEmergencyContacts(memberId: string, ownerEmail?: string): Promise<EmergencyContact[]> {
    if (!ownerEmail) return [];
    try {
      const raw = await AsyncStorage.getItem(KEY('emergency', memberId, ownerEmail));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  async saveEmergencyContact(contact: EmergencyContact, ownerEmail: string): Promise<void> {
    const all = await this.getEmergencyContacts(contact.memberId, ownerEmail);
    const idx = all.findIndex(c => c.id === contact.id);
    if (idx >= 0) all[idx] = contact; else all.push(contact);
    await AsyncStorage.setItem(KEY('emergency', contact.memberId, ownerEmail), JSON.stringify(all));
  },

  async deleteEmergencyContact(memberId: string, contactId: string, ownerEmail: string): Promise<void> {
    const all = await this.getEmergencyContacts(memberId, ownerEmail);
    await AsyncStorage.setItem(KEY('emergency', memberId, ownerEmail), JSON.stringify(all.filter(c => c.id !== contactId)));
  },

  // ── Education ──
  async getEducation(memberId: string, ownerEmail?: string): Promise<MemberEducation[]> {
    if (!ownerEmail) return [];
    try {
      const raw = await AsyncStorage.getItem(KEY('education', memberId, ownerEmail));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  async saveEducation(edu: MemberEducation, ownerEmail: string): Promise<void> {
    const all = await this.getEducation(edu.memberId, ownerEmail);
    const idx = all.findIndex(e => e.id === edu.id);
    if (idx >= 0) all[idx] = edu; else all.push(edu);
    await AsyncStorage.setItem(KEY('education', edu.memberId, ownerEmail), JSON.stringify(all));
  },

  async deleteEducation(memberId: string, eduId: string, ownerEmail: string): Promise<void> {
    const all = await this.getEducation(memberId, ownerEmail);
    await AsyncStorage.setItem(KEY('education', memberId, ownerEmail), JSON.stringify(all.filter(e => e.id !== eduId)));
  },

  // ── Notes ──
  async getNotes(memberId: string, ownerEmail?: string): Promise<MemberNote[]> {
    if (!ownerEmail) return [];
    try {
      const raw = await AsyncStorage.getItem(KEY('notes', memberId, ownerEmail));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  async saveNote(note: MemberNote, ownerEmail: string): Promise<void> {
    const all = await this.getNotes(note.memberId, ownerEmail);
    const idx = all.findIndex(n => n.id === note.id);
    if (idx >= 0) all[idx] = note; else all.unshift(note);
    await AsyncStorage.setItem(KEY('notes', note.memberId, ownerEmail), JSON.stringify(all));
  },

  async deleteNote(memberId: string, noteId: string, ownerEmail: string): Promise<void> {
    const all = await this.getNotes(memberId, ownerEmail);
    await AsyncStorage.setItem(KEY('notes', memberId, ownerEmail), JSON.stringify(all.filter(n => n.id !== noteId)));
  },

  // ── Social Media ──
  async getSocials(memberId: string, ownerEmail?: string): Promise<MemberSocial[]> {
    if (!ownerEmail) return [];
    try {
      const raw = await AsyncStorage.getItem(KEY('social', memberId, ownerEmail));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  async saveSocial(social: MemberSocial, ownerEmail: string): Promise<void> {
    const all = await this.getSocials(social.memberId, ownerEmail);
    const idx = all.findIndex(s => s.id === social.id);
    if (idx >= 0) all[idx] = social; else all.push(social);
    await AsyncStorage.setItem(KEY('social', social.memberId, ownerEmail), JSON.stringify(all));
  },

  async deleteSocial(memberId: string, socialId: string, ownerEmail: string): Promise<void> {
    const all = await this.getSocials(memberId, ownerEmail);
    await AsyncStorage.setItem(KEY('social', memberId, ownerEmail), JSON.stringify(all.filter(s => s.id !== socialId)));
  },

  // ── Linked App Assets ──
  async getLinkedAssetIds(memberId: string, ownerEmail?: string): Promise<string[]> {
    if (!ownerEmail) return [];
    try {
      const raw = await AsyncStorage.getItem(KEY('linked_assets', memberId, ownerEmail));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  async saveLinkedAssetIds(memberId: string, assetIds: string[], ownerEmail: string): Promise<void> {
    await AsyncStorage.setItem(KEY('linked_assets', memberId, ownerEmail), JSON.stringify(assetIds));
  },
};
