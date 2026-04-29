import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthService } from './auth';
import { CostService } from './costService';
import { InsuranceService } from './insuranceService';
import { AgendaEvent } from '../types/agenda';
import { overlayExecutionStatusOutboxOnTasks, pullTasks } from './syncService';
import { AGENDA_OVERLAP_IN_APP_ID, NotificationService } from './notifications';
import i18n from '../i18n';
import { taskRowIsRoutineTask } from '../lib/routineTaskQueueUi';
import { loadFtCloudTasks } from '../lib/cloudTasksBuckets';

/** Quem consome a agenda unificada: compromissos do cliente vs OS de execução do prestador. */
export type AgendaScope = 'CLIENT' | 'PROVIDER' | 'ALL';

/** Tarefas de rotina (RT): delegação para `taskRowIsRoutineTask`. */
function agendaRowIsRoutineTask(ev: any): boolean {
  return taskRowIsRoutineTask(ev);
}

/**
 * Itens da agenda ligados à execução de OS (checklist / nuvem), não a reservas/manuais/financeiro do cliente.
 * Exclui RT aqui — no modo prestador as RT entram via `agendaRowIsRoutineTask` no filtro de scope.
 */
export function isProviderScopeAgendaEvent(ev: AgendaEvent): boolean {
  if (agendaRowIsRoutineTask(ev)) return false;
  if (ev.source === 'CHECKLIST') return true;
  const src = ev.source as string | undefined;
  if (src === 'MANUAL' || src === 'COST' || src === 'INSURANCE') return false;
  if (ev.category === 'TASK' && ev.refId) return true;
  return false;
}

const AGENDA_OVERLAP_SIG_KEY = '@brspark_agenda_overlap_sig';

/** Evita martelar `/api/sync/tasks` em focos rápidos (tabs / re-renders). */
const providerPullTasksThrottle = new Map<string, number>();
const PROVIDER_PULL_TASKS_MIN_INTERVAL_MS = 3500;

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
    /** Só prestador: OS/checklist na agenda; nunca inbox do cliente. */
    NotificationService.addNotification({
      title: i18n.t('agenda.overlapNotificationTitle'),
      body: i18n.t('agenda.overlapNotificationBody'),
      category: 'alert',
      personaScope: 'provider',
      fixedId: AGENDA_OVERLAP_IN_APP_ID,
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
  async getUnifiedAgenda(ownerEmail?: string, scope: AgendaScope = 'ALL'): Promise<AgendaEvent[]> {
    if (!ownerEmail) return [];

    if (scope === 'PROVIDER') {
      const em = String(ownerEmail).trim().toLowerCase();
      const now = Date.now();
      const prev = providerPullTasksThrottle.get(em) || 0;
      if (now - prev >= PROVIDER_PULL_TASKS_MIN_INTERVAL_MS) {
        providerPullTasksThrottle.set(em, now);
        try {
          await pullTasks(ownerEmail);
        } catch (e) {
          console.warn('[AgendaService] pullTasks antes da agenda (modo prestador):', e);
        }
      }
    }

    // 1. Get manually added events (Bookings, Maintenance, Tasks)
    let localEvents = await this.getLocalEvents(ownerEmail);

    // 1.5. OS/FT em cache local (preenchido por pullTasks acima ou por fullSync / home)
    try {
      const cloudData = await loadFtCloudTasks();
      if (Array.isArray(cloudData) && cloudData.length > 0) {
         const mergedCloudRaw = await overlayExecutionStatusOutboxOnTasks(cloudData);
         const mergedCloud = mergedCloudRaw.filter((t: any) => {
           const st = String(t.status || '').toUpperCase();
           if (st === 'CANCELLED' || st === 'CANCELED') return false;
           return true;
         });
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
    let allPolicies: any[] = [];
    if (rawPoliciesRaw) {
      try {
        const parsed = JSON.parse(rawPoliciesRaw);
        allPolicies = Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.warn('[AgendaService] cache de seguros inválido, ignorando payload local:', e);
        allPolicies = [];
      }
    }
    
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

    let mergedAll = [...localEvents, ...financeEvents, ...insuranceEvents];
    if (scope === 'CLIENT') {
      mergedAll = mergedAll.filter((e) => !isProviderScopeAgendaEvent(e) && !agendaRowIsRoutineTask(e));
    } else if (scope === 'PROVIDER') {
      mergedAll = mergedAll.filter((e) => isProviderScopeAgendaEvent(e));
    }
    markAgendaOverlaps(mergedAll);
    const overlapIds = mergedAll.filter((e) => e.agendaOverlap).map((e) => e.id);
    /** Sobreposição de blocos de OS só existe na vista prestador; evita alerta errado / escopo cliente. */
    if (scope === 'PROVIDER' && overlapIds.length > 0) {
      void notifyAgendaOverlapIfNeeded(overlapIds);
    }
    return mergedAll;
  }
};
