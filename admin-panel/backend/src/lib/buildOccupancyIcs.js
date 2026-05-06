'use strict';

/**
 * Gera um calendário iCalendar (RFC 5545) com períodos ocupados de um ativo,
 * a partir do array JSON de `agenda_events` (UserModuleData).
 */

function icsEscape(text) {
  if (text == null) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function ymdAddDays(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const ys = dt.getUTCFullYear();
  const ms = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const ds = String(dt.getUTCDate()).padStart(2, '0');
  return `${ys}-${ms}-${ds}`;
}

function ymdToIcsDate(ymd) {
  const s = String(ymd).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s.replace(/-/g, '');
}

function formatIcsUtcNow() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

const EXPORT_CATEGORIES = new Set(['BOOKING', 'MAINTENANCE', 'MEETING', 'TASK']);

/**
 * @param {object} opts
 * @param {any[]} opts.events
 * @param {string} opts.assetId
 * @param {string} opts.calName
 */
function buildOccupancyIcs({ events, assetId, calName }) {
  const lines = [];
  const push = (s) => lines.push(s);

  push('BEGIN:VCALENDAR');
  push('VERSION:2.0');
  push('PRODID:-//Aria//Occupancy//PT');
  push('CALSCALE:GREGORIAN');
  push(`X-WR-CALNAME:${icsEscape(calName || 'Aria')}`);
  push('METHOD:PUBLISH');

  const list = Array.isArray(events) ? events : [];

  for (const ev of list) {
    if (!ev || String(ev.assetId || '') !== String(assetId)) continue;
    if (ev._isShared) continue;

    const cat = String(ev.category || '');
    const src = String(ev.source || '');

    if (cat === 'FINANCE' || cat === 'INSURANCE') continue;

    if (src === 'CHECKLIST') {
      const aStart = ev.agendaStartAt ? new Date(ev.agendaStartAt).getTime() : NaN;
      const aEnd = ev.agendaEndAt ? new Date(ev.agendaEndAt).getTime() : NaN;
      if (Number.isFinite(aStart) && Number.isFinite(aEnd) && aEnd > aStart) {
        const uid = `aria-${String(ev.id).replace(/[^a-zA-Z0-9-]/g, '')}@aria`;
        const dtStamp = formatIcsUtcNow();
        const ds = new Date(aStart).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
        const de = new Date(aEnd).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
        push('BEGIN:VEVENT');
        push(`UID:${uid}`);
        push(`DTSTAMP:${dtStamp}`);
        push(`DTSTART:${ds}`);
        push(`DTEND:${de}`);
        push(`SUMMARY:${icsEscape(ev.title || 'Ocupado')}`);
        if (ev.description) push(`DESCRIPTION:${icsEscape(String(ev.description).slice(0, 2000))}`);
        push('END:VEVENT');
      } else if (ev.startDate && ev.endDate) {
        emitAllDayEvent(ev, cat || 'TASK');
      }
      continue;
    }

    if (!EXPORT_CATEGORIES.has(cat)) continue;

    if (ev.startDate && ev.endDate) {
      emitAllDayEvent(ev, cat);
    }
  }

  function emitAllDayEvent(ev, cat) {
    const sd = ymdToIcsDate(ev.startDate);
    if (!sd || !ymdToIcsDate(ev.endDate)) return;
    const edExclusive = ymdAddDays(ev.endDate, 1);
    const ed = ymdToIcsDate(edExclusive);
    if (!ed) return;

    const uid = `aria-${String(ev.id).replace(/[^a-zA-Z0-9-]/g, '')}@aria`;
    const dtStamp = formatIcsUtcNow();
    push('BEGIN:VEVENT');
    push(`UID:${uid}`);
    push(`DTSTAMP:${dtStamp}`);
    push(`DTSTART;VALUE=DATE:${sd}`);
    push(`DTEND;VALUE=DATE:${ed}`);
    const sum = ev.title || (cat === 'BOOKING' ? 'Reserva' : 'Ocupado');
    push(`SUMMARY:${icsEscape(sum)}`);
    if (ev.description) push(`DESCRIPTION:${icsEscape(String(ev.description).slice(0, 2000))}`);
    push('END:VEVENT');
  }

  push('END:VCALENDAR');

  return lines.join('\r\n');
}

module.exports = { buildOccupancyIcs };
