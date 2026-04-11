import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthService } from './auth';
import { CostService } from './costService';
import { InsuranceService } from './insuranceService';
import { AgendaEvent } from '../types/agenda';
import { overlayExecutionStatusOutboxOnTasks } from './syncService';
import { NotificationService } from './notifications';
import i18n from '../i18n';

const AGENDA_OVERLAP_SIG_KEY = '@brspark_agenda_overlap_sig';

function parseChecklistAgendaInterval(ev: AgendaEvent): { start: number; end: number } | null {
  if (ev.source !== 'CHECKLIST' || !ev.agendaStartAt || !ev.agendaEndAt) return null;
  const s = new Date(ev.agendaStartAt).getTime();
  const e = new Date(ev.agendaEndAt).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  return { start: s, end: e };
}

/** Marca `agendaOverlap` quando duas OS com bloco horário intersectam no tempo. */
function markAgendaOverlaps(events: AgendaEvent[]) {
  const rows = events
    .map((ev) => ({ ev, iv: parseChecklistAgendaInterval(ev) }))
    .filter((x): x is { ev: AgendaEvent; iv: { start: number; end: number } } => x.iv != null);
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i].iv;
      const b = rows[j].iv;
      if (a.start < b.end && b.start < a.end) {
        rows[i].ev.agendaOverlap = true;
        rows[j].ev.agendaOverlap = true;
      }
    }
  }
}

async function notifyAgendaOverlapIfNeeded(overlapIds: string[]) {
  const sig = overlapIds.slice().sort().join('|');
  if (!sig) return;
  try {
    const prev = await AsyncStorage.getItem(AGENDA_OVERLAP_SIG_KEY);
    if (prev === sig) return;
    await AsyncStorage.setItem(AGENDA_OVERLAP_SIG_KEY, sig);
    NotificationService.addNotification({
      title: i18n.t('agenda.overlapNotificationTitle'),
      body: i18n.t('agenda.overlapNotificationBody'),
      category: 'alert',
    });
  } catch {
    /* ignore */
  }
}

const KEY = (email: string) => AuthService.getUserKey('agenda_events', email);

// Map categories to UI colors
export const AGENDA_COLORS = {
  BOOKING: '#10B981',       // Green (Tied to an asset reservation)
  MAINTENANCE: '#F59E0B',   // Orange/Amber (Service/Fixes)
  TASK: '#6366F1',          // Indigo (To-do lists)
  MEETING: '#EC4899',       // Pink
  FINANCE: '#EF4444',       // Red (Aggregated from Costs)
  INSURANCE: '#0EA5E9',     // Light Blue (Aggregated from Policies)
};

export const AgendaService = {
  // ─── 1. Manual/Local Events ───
  async getLocalEvents(ownerEmail?: string): Promise<AgendaEvent[]> {
    if (!ownerEmail) return [];
    try {
      const data = await AsyncStorage.getItem(KEY(ownerEmail));
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error fetching local agenda events', e);
      return [];
    }
  },

  async saveEvent(event: AgendaEvent, ownerEmail: string): Promise<void> {
    if (!ownerEmail) throw new Error("Usuário não autenticado.");
    const all = await this.getLocalEvents(ownerEmail);
    const updated = { ...event, ownerEmail };
    const idx = all.findIndex(e => e.id === updated.id);
    
    if (idx >= 0) all[idx] = updated; 
    else all.push(updated);
    
    await AsyncStorage.setItem(KEY(ownerEmail), JSON.stringify(all));
  },

  async deleteEvent(id: string, ownerEmail: string): Promise<void> {
    const all = await this.getLocalEvents(ownerEmail);
    await AsyncStorage.setItem(KEY(ownerEmail), JSON.stringify(all.filter(e => e.id !== id)));
  },

  // ─── 2. Unified Aggregator (Passivo + Ativo) ───
  async getUnifiedAgenda(ownerEmail?: string): Promise<AgendaEvent[]> {
    if (!ownerEmail) return [];
    
    // 1. Get manually added events (Bookings, Maintenance, Tasks)
    let localEvents = await this.getLocalEvents(ownerEmail);
    
    // 1.5. Pull Tasks (Vistorias) Despachadas via Sync Background
    try {
      const cloudStr = await AsyncStorage.getItem('@brspark_cloud_tasks') || '[]';
      let cloudData: any[] = [];
      try { cloudData = JSON.parse(cloudStr); } catch(e){}
      
      if (Array.isArray(cloudData) && cloudData.length > 0) {
         const mergedCloud = await overlayExecutionStatusOutboxOnTasks(cloudData);
         const cloudIds = new Set(mergedCloud.map(t => t.id));
         localEvents = localEvents.filter(e => !cloudIds.has(e.id));
         localEvents = [...localEvents, ...mergedCloud];
      }
    } catch (err) {
      console.warn('Falha silenciosa ao ler cloud tasks do AsyncStorage:', err);
    }
    
    // 2. Map Financial recurrences (To Pay) -> Single day events
    const recurringCosts = await CostService.getRecurringCosts(ownerEmail);
    const financeEvents: AgendaEvent[] = recurringCosts
      .filter(r => r.status === 'ACTIVE' && r.nextDueDate) // Only active
      .map(r => ({
        id: `fin-${r.id}`,
        title: r.description,
        description: `Vencimento financeiro: ${r.amount}`,
        assetId: r.assetId,
        category: 'FINANCE',
        startDate: r.nextDueDate,
        endDate: r.nextDueDate,
        color: AGENDA_COLORS.FINANCE,
        isAllDay: true,
        source: 'COST',
        refId: r.id,
        ownerEmail
      }));

    // 3. Map Insurances expiring soon
    const policies = (await InsuranceService.getExpiringPolicies(ownerEmail)) || []; // We filter expiring inside InsuranceService, let's get all active ones instead to trace them if we want? 
    // Actually, getting all policies is better. Let's fetch all and show endDates.
    
    // Re-fetch all so we see all expirations in the future
    const rawPoliciesRaw = await AsyncStorage.getItem(AuthService.getUserKey('insurance_policies', ownerEmail));
    const allPolicies = rawPoliciesRaw ? JSON.parse(rawPoliciesRaw) : [];
    
    const insuranceEvents: AgendaEvent[] = allPolicies
      .filter((p: any) => p.status !== 'CANCELLED' && p.endDate)
      .map((p: any) => ({
        id: `ins-${p.id}`,
        title: `Seguro: ${p.insurer}`,
        description: `Apólice vencendo na data`,
        assetId: p.assetId,
        category: 'INSURANCE',
        startDate: p.endDate,
        endDate: p.endDate,
        color: AGENDA_COLORS.INSURANCE,
        isAllDay: true,
        source: 'INSURANCE',
        refId: p.id,
        ownerEmail
      }));

    const mergedAll = [...localEvents, ...financeEvents, ...insuranceEvents];
    markAgendaOverlaps(mergedAll);
    const overlapIds = mergedAll.filter((e) => e.agendaOverlap).map((e) => e.id);
    if (overlapIds.length > 0) {
      void notifyAgendaOverlapIfNeeded(overlapIds);
    }
    return mergedAll;
  }
};
