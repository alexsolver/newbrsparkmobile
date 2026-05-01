/**
 * Cobertura geográfica na candidatura de prestador: alinhado ao perfil (vários círculos por turno em `workScheduleJson`)
 * e resumo `serviceCoverageGeoJson` esperado pelo backend (`normalizeServiceCoverageGeo`).
 */

import {
  TECH_SCHEDULE_DAY_ORDER,
  type TechScheduleState,
  type TechServiceAreaCircle,
  rid,
} from './technicianScheduleForm';

export function clampSlotCircle(c: TechServiceAreaCircle): TechServiceAreaCircle {
  const r = Number(c.radiusKm);
  return {
    id: c.id,
    latitude: c.latitude,
    longitude: c.longitude,
    radiusKm: Math.min(500, Math.max(0.5, Number.isFinite(r) ? r : 10)),
  };
}

type LegacyGeo = {
  homeBase?: { latitude?: number; longitude?: number } | null;
  radiusKm?: number | null;
} | null;

/**
 * Rascunhos antigos só tinham um centro/raio global; replica esse valor em cada turno activo sem círculos.
 */
export function migrateLegacyCoverageIntoSchedule(
  schedule: TechScheduleState,
  geo: LegacyGeo
): TechScheduleState {
  if (!geo?.homeBase) return schedule;
  const lat = Number(geo.homeBase.latitude);
  const lng = Number(geo.homeBase.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return schedule;
  const rkRaw = Number(geo.radiusKm);
  const radiusKm = Number.isFinite(rkRaw) && rkRaw > 0 ? Math.min(500, Math.max(0.5, rkRaw)) : 50;

  const out: TechScheduleState = { ...schedule };
  for (const day of TECH_SCHEDULE_DAY_ORDER) {
    const slots = [...(out[day] || [])];
    let changed = false;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot?.enabled) continue;
      if ((slot.serviceAreaCircles?.length ?? 0) > 0) continue;
      slots[i] = {
        ...slot,
        serviceAreaCircles: [
          {
            id: rid(),
            latitude: lat,
            longitude: lng,
            radiusKm,
          },
        ],
      };
      changed = true;
    }
    if (changed) out[day] = slots;
  }
  return out;
}

/** Cada turno com disponibilidade activa deve ter pelo menos um círculo com raio > 0. */
export function enabledSlotsHaveServiceAreaCircles(schedule: TechScheduleState): boolean {
  for (const day of TECH_SCHEDULE_DAY_ORDER) {
    for (const slot of schedule[day] || []) {
      if (!slot?.enabled) continue;
      const circles = slot.serviceAreaCircles || [];
      const ok = circles.some((c) => {
        const r = Number(c.radiusKm);
        return (
          Number.isFinite(c.latitude) &&
          Number.isFinite(c.longitude) &&
          Number.isFinite(r) &&
          r > 0
        );
      });
      if (!ok) return false;
    }
  }
  return true;
}

export function deriveServiceCoverageGeoFromSchedule(
  schedule: TechScheduleState,
  addr: {
    line1: string;
    city: string;
    stateUf: string;
    postal: string;
    country: string;
  },
  notes: string | null
): {
  homeBase: {
    latitude: number;
    longitude: number;
    address: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    countryCode: string | null;
  };
  radiusKm: number;
  notes: string | null;
} | null {
  const collected: { latitude: number; longitude: number; radiusKm: number }[] = [];
  for (const day of TECH_SCHEDULE_DAY_ORDER) {
    for (const slot of schedule[day] || []) {
      if (!slot?.enabled) continue;
      for (const c of slot.serviceAreaCircles || []) {
        const r = Number(c.radiusKm);
        if (
          !Number.isFinite(c.latitude) ||
          !Number.isFinite(c.longitude) ||
          !Number.isFinite(r) ||
          r <= 0
        ) {
          continue;
        }
        collected.push({
          latitude: c.latitude,
          longitude: c.longitude,
          radiusKm: Math.min(500, Math.max(0.5, r)),
        });
      }
    }
  }
  if (!collected.length) return null;
  const maxKm = Math.max(...collected.map((x) => x.radiusKm));
  const first = collected[0];
  return {
    homeBase: {
      latitude: first.latitude,
      longitude: first.longitude,
      address: addr.line1.trim() || null,
      city: addr.city.trim() || null,
      state: addr.stateUf.trim() || null,
      postalCode: addr.postal.trim() || null,
      countryCode: addr.country.trim() || 'BR',
    },
    radiusKm: maxKm,
    notes: notes?.trim() ? notes.trim().slice(0, 500) : null,
  };
}
