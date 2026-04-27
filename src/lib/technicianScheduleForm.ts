/**
 * Horário semanal de prestador — alinhado a `admin-panel/backend/.../technicianWorkScheduleNormalize.js`
 * (regex 24h, chaves mon…sun, slots { id, enabled, start, end, locationIds, serviceAreaCircles }).
 */

export const TECH_SCHEDULE_DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type TechScheduleDayKey = (typeof TECH_SCHEDULE_DAY_ORDER)[number];

/** Área de atendimento por raio (km) no mapa — várias por turno (painel admin). */
export type TechServiceAreaCircle = {
  id: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
};

export type TechScheduleSlot = {
  id: string;
  enabled: boolean;
  start: string;
  end: string;
  locationIds: string[];
  serviceAreaCircles: TechServiceAreaCircle[];
};

export type TechScheduleState = Record<string, TechScheduleSlot[]>;

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const MAX_SERVICE_AREA_CIRCLES = 20;

function parseServiceAreaCircles(raw: unknown): TechServiceAreaCircle[] {
  if (!Array.isArray(raw)) return [];
  const out: TechServiceAreaCircle[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Record<string, unknown>;
    const lat = Number(o.latitude);
    const lng = Number(o.longitude);
    let r = Number(String(o.radiusKm == null ? '' : o.radiusKm).replace(',', '.'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(r)) continue;
    r = Math.min(500, Math.max(0.5, r));
    out.push({
      id: String(o.id || rid()),
      latitude: lat,
      longitude: lng,
      radiusKm: r,
    });
    if (out.length >= MAX_SERVICE_AREA_CIRCLES) break;
  }
  return out;
}

export function isValidHhMm(s: string): boolean {
  return TIME_RE.test(String(s || '').trim());
}

export function rid(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultSchedule(): TechScheduleState {
  const o: TechScheduleState = {};
  for (const k of TECH_SCHEDULE_DAY_ORDER) {
    o[k] = [{ id: rid(), enabled: false, start: '08:00', end: '18:00', locationIds: [], serviceAreaCircles: [] }];
  }
  return o;
}

/** Carrega o JSON vindo de perfil / candidatura, garantindo 7 chaves. */
export function parseScheduleFromProfileJson(raw: unknown): TechScheduleState {
  const merged = defaultSchedule();
  if (!raw || typeof raw !== 'object') return merged;
  const w = raw as Record<string, unknown>;
  for (const k of TECH_SCHEDULE_DAY_ORDER) {
    const day = w[k];
    if (Array.isArray(day) && day.length) {
      merged[k] = day.map(
        (slot: {
          id?: string;
          enabled?: boolean;
          start?: string;
          end?: string;
          locationIds?: unknown;
          serviceAreaCircles?: unknown;
        }) => ({
          id: String(slot?.id || rid()),
          enabled: !!slot?.enabled,
          start: String(slot?.start || '08:00'),
          end: String(slot?.end || '18:00'),
          locationIds: Array.isArray(slot?.locationIds) ? (slot.locationIds as unknown[]).map(String) : [],
          serviceAreaCircles: parseServiceAreaCircles(slot?.serviceAreaCircles),
        })
      );
    }
  }
  return merged;
}

/**
 * Devolve o primeiro horário inválido num dia com disponibilidade activa (qualquer turno).
 * Formato validado: mesmo que o servidor (`^([01]?\d|2[0-3]):[0-5]\d$`).
 */
export function findFirstInvalidEnabledTime(
  schedule: TechScheduleState
): { day: TechScheduleDayKey; part: 'start' | 'end'; slotIndex: number } | null {
  for (const day of TECH_SCHEDULE_DAY_ORDER) {
    const slots = Array.isArray(schedule[day]) ? schedule[day] : [];
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const slot = slots[slotIndex];
      if (!slot?.enabled) continue;
      const start = String(slot.start || '').trim();
      const end = String(slot.end || '').trim();
      if (!isValidHhMm(start)) return { day, part: 'start', slotIndex };
      if (!isValidHhMm(end)) return { day, part: 'end', slotIndex };
    }
  }
  return null;
}
