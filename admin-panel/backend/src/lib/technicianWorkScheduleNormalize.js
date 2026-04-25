'use strict';

const { defaultEmptySchedule } = require('./techRegistrationDefaults');

/**
 * Garante estrutura mon…sun com slots { id, enabled, start, end, locationIds[] }.
 * @param {unknown} raw
 * @returns {Record<string, Array<{ id: string; enabled: boolean; start: string; end: string; locationIds: string[] }>> | null}
 */
function normalizeWorkScheduleJson(raw) {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object') return null;
  const base = defaultEmptySchedule();
  const timeRe = /^([01]?\d|2[0-3]):[0-5]\d$/;

  for (const day of Object.keys(base)) {
    const slotsIn = (raw[day] );
    if (!Array.isArray(slotsIn) || !slotsIn.length) continue;
    const out = [];
    for (const slot of slotsIn) {
      if (!slot || typeof slot !== 'object') continue;
      const start = String(slot.start || '08:00').trim();
      const end = String(slot.end || '18:00').trim();
      if (!timeRe.test(start) || !timeRe.test(end)) continue;
      const locIds = Array.isArray(slot.locationIds) ? slot.locationIds.map((x) => String(x)) : [];
      out.push({
        id: String(slot.id || `s_${day}_${out.length}`).slice(0, 64),
        enabled: !!slot.enabled,
        start: start.length === 4 ? `0${start}` : start,
        end: end.length === 4 ? `0${end}` : end,
        locationIds: [...new Set(locIds)],
      });
    }
    if (out.length) base[day] = out;
  }
  return base;
}

module.exports = { normalizeWorkScheduleJson };
