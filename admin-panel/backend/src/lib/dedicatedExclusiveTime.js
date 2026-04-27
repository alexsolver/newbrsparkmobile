'use strict';

/** @typedef {{ weekday: string, start: string, end: string }} WeeklyWindow */

const WEEKDAY_LONG_TO_KEY = {
  sunday: 'sun',
  monday: 'mon',
  tuesday: 'tue',
  wednesday: 'wed',
  thursday: 'thu',
  friday: 'fri',
  saturday: 'sat',
};

const ALLOWED_WEEKDAY = new Set(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);

/**
 * Extrai bloco `dedicatedExclusive` de `ProviderTenantAffiliation.tenantScheduleJson`.
 * Formato: { dedicatedExclusive?: { timezone?: string, weeklyWindows?: WeeklyWindow[] } }
 * @param {unknown} raw
 * @returns {{ timezone: string, weeklyWindows: WeeklyWindow[] } | null}
 */
function parseDedicatedExclusiveFromTenantScheduleJson(raw) {
  if (raw == null) return null;
  let o = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const block = o.dedicatedExclusive;
  if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
  const tz = block.timezone != null ? String(block.timezone).trim() : '';
  const arr = Array.isArray(block.weeklyWindows) ? block.weeklyWindows : [];
  const weeklyWindows = [];
  for (const w of arr) {
    if (!w || typeof w !== 'object') continue;
    const weekday = String(w.weekday || '')
      .trim()
      .toLowerCase()
      .slice(0, 3);
    if (!ALLOWED_WEEKDAY.has(weekday)) continue;
    const start = normalizeHhMm(w.start);
    const end = normalizeHhMm(w.end);
    if (!start || !end) continue;
    weeklyWindows.push({ weekday, start, end });
  }
  if (!weeklyWindows.length) return null;
  return { timezone: tz || 'UTC', weeklyWindows };
}

function normalizeHhMm(v) {
  const s = String(v ?? '')
    .trim()
    .replace(/,/g, '.');
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function hmToMinutes(hm) {
  const [h, m] = String(hm).split(':').map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/**
 * Dia da semana (sun..sat) no fuso IANA.
 * @param {Date} at
 * @param {string} timeZone
 * @returns {string|null}
 */
function weekdayKeyInTimeZone(at, timeZone) {
  let tz = String(timeZone || 'UTC').trim() || 'UTC';
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(at);
  } catch {
    tz = 'UTC';
  }
  const long = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' })
    .format(at)
    .toLowerCase()
    .trim();
  return WEEKDAY_LONG_TO_KEY[long] || null;
}

/**
 * Hora local HH:mm no fuso.
 * @param {Date} at
 * @param {string} timeZone
 * @returns {string|null}
 */
function hhmmInTimeZone(at, timeZone) {
  let tz = String(timeZone || 'UTC').trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(at);
  } catch {
    tz = 'UTC';
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  let h = '';
  let m = '';
  for (const p of parts) {
    if (p.type === 'hour') h = p.value;
    if (p.type === 'minute') m = p.value;
  }
  if (!h || !m) return null;
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

/**
 * Intervalo [start,end) em minutos do dia; suporta atravessa meia-noite (start > end).
 * @param {number} m — minutos desde meia-noite [0, 1440)
 * @param {number} start
 * @param {number} end
 */
function minuteInHalfOpenWindow(m, start, end) {
  if (start === end) return false;
  if (start < end) return m >= start && m < end;
  return m >= start || m < end;
}

/**
 * `at` cai dentro de alguma janela semanal (no TZ da janela)?
 * @param {Date} at
 * @param {WeeklyWindow[]} weeklyWindows
 * @param {string} timeZone
 */
function isInstantInDedicatedWeeklyWindows(at, weeklyWindows, timeZone) {
  if (!Array.isArray(weeklyWindows) || weeklyWindows.length === 0) return false;
  const wd = weekdayKeyInTimeZone(at, timeZone);
  if (!wd) return false;
  const hm = hhmmInTimeZone(at, timeZone);
  if (!hm) return false;
  const mNow = hmToMinutes(hm);
  if (mNow == null) return false;
  for (const w of weeklyWindows) {
    if (String(w.weekday) !== wd) continue;
    const a = hmToMinutes(w.start);
    const b = hmToMinutes(w.end);
    if (a == null || b == null) continue;
    if (minuteInHalfOpenWindow(mNow, a, b)) return true;
  }
  return false;
}

/**
 * @param {Date} at
 * @param {{ timezone: string, weeklyWindows: WeeklyWindow[] } | null} parsed
 */
function isInstantInDedicatedBlock(at, parsed) {
  if (!parsed || !parsed.weeklyWindows.length) return false;
  return isInstantInDedicatedWeeklyWindows(at, parsed.weeklyWindows, parsed.timezone);
}

/** Para cada weekday, testar overlap de pares de intervalos (inclui atravessa meia-noite). */
function weeklyWindowsOverlapSimple(wa, wb) {
  const days = [...ALLOWED_WEEKDAY];
  for (const wd of days) {
    const listA = (wa || []).filter((w) => w.weekday === wd);
    const listB = (wb || []).filter((w) => w.weekday === wd);
    for (const x of listA) {
      const ax0 = hmToMinutes(x.start);
      const ax1 = hmToMinutes(x.end);
      if (ax0 == null || ax1 == null) continue;
      for (const y of listB) {
        const bx0 = hmToMinutes(y.start);
        const bx1 = hmToMinutes(y.end);
        if (bx0 == null || bx1 == null) continue;
        if (pairOverlaps(ax0, ax1, bx0, bx1)) return true;
      }
    }
  }
  return false;
}

/**
 * @param {number} a0 start minutes
 * @param {number} a1 end minutes (exclusive); se < a0, atravessa meia-noite
 */
function pairOverlaps(a0, a1, b0, b1) {
  const segs = (s, e) => {
    if (s === e) return [];
    if (s < e) return [[s, e]];
    return [
      [s, 1440],
      [0, e],
    ];
  };
  for (const [as, ae] of segs(a0, a1)) {
    for (const [bs, be] of segs(b0, b1)) {
      if (Math.max(as, bs) < Math.min(ae, be)) return true;
    }
  }
  return false;
}

/**
 * Valida payload vindo do painel antes de gravar.
 * @param {unknown} body — { timezone?: string, weeklyWindows?: WeeklyWindow[] }
 */
function validateDedicatedExclusivePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Corpo inválido.' };
  }
  const tzIn = body.timezone != null ? String(body.timezone).trim() : 'UTC';
  let tz = tzIn || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
  } catch {
    return { ok: false, error: `Fuso horário IANA inválido: ${tzIn}` };
  }
  const arr = Array.isArray(body.weeklyWindows) ? body.weeklyWindows : [];
  if (arr.length > 48) {
    return { ok: false, error: 'No máximo 48 janelas semanais.' };
  }
  const weeklyWindows = [];
  for (const w of arr) {
    if (!w || typeof w !== 'object') continue;
    const weekday = String(w.weekday || '')
      .trim()
      .toLowerCase()
      .slice(0, 3);
    if (!ALLOWED_WEEKDAY.has(weekday)) {
      return { ok: false, error: `weekday inválido: ${w.weekday}` };
    }
    const start = normalizeHhMm(w.start);
    const end = normalizeHhMm(w.end);
    if (!start || !end) {
      return { ok: false, error: 'Cada janela precisa de start e end (HH:mm).' };
    }
    weeklyWindows.push({ weekday, start, end });
  }
  if (!weeklyWindows.length) {
    return { ok: false, error: 'Indique pelo menos uma janela semanal.' };
  }
  /** overlap dentro do mesmo payload */
  const days = [...ALLOWED_WEEKDAY];
  for (const wd of days) {
    const list = weeklyWindows.filter((x) => x.weekday === wd);
    for (let i = 0; i < list.length; i++) {
      const a0 = hmToMinutes(list[i].start);
      const a1 = hmToMinutes(list[i].end);
      if (a0 == null || a1 == null) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b0 = hmToMinutes(list[j].start);
        const b1 = hmToMinutes(list[j].end);
        if (b0 == null || b1 == null) continue;
        if (pairOverlaps(a0, a1, b0, b1)) {
          return { ok: false, error: `Janelas sobrepostas em ${wd}.` };
        }
      }
    }
  }
  return { ok: true, timezone: tz, weeklyWindows };
}

/**
 * Detecta se dois horários dedicados (fusos diferentes permitidos) intersectam
 * nos próximos `sampleDays` dias (amostragem por slot).
 * @param {{ timezone: string, weeklyWindows: WeeklyWindow[] } | null} parsedA
 * @param {{ timezone: string, weeklyWindows: WeeklyWindow[] } | null} parsedB
 */
function dedicatedExclusiveSchedulesOverlap(parsedA, parsedB, sampleDays = 14, slotMinutes = 15) {
  if (!parsedA || !parsedB || !parsedA.weeklyWindows.length || !parsedB.weeklyWindows.length) return false;
  const start = new Date();
  start.setSeconds(0, 0);
  const endMs = start.getTime() + sampleDays * 86400000;
  const step = Math.max(5, Math.min(60, slotMinutes)) * 60000;
  for (let t = start.getTime(); t < endMs; t += step) {
    const d = new Date(t);
    if (isInstantInDedicatedBlock(d, parsedA) && isInstantInDedicatedBlock(d, parsedB)) return true;
  }
  return false;
}

function buildTenantScheduleJsonDedicatedExclusive(existingJson, timezone, weeklyWindows) {
  let base = {};
  if (existingJson != null) {
    if (typeof existingJson === 'object' && !Array.isArray(existingJson)) {
      base = { ...existingJson };
    } else if (typeof existingJson === 'string') {
      try {
        const p = JSON.parse(existingJson);
        if (p && typeof p === 'object' && !Array.isArray(p)) base = { ...p };
      } catch {
        base = {};
      }
    }
  }
  base.dedicatedExclusive = {
    timezone,
    weeklyWindows,
  };
  return base;
}

module.exports = {
  parseDedicatedExclusiveFromTenantScheduleJson,
  isInstantInDedicatedWeeklyWindows,
  isInstantInDedicatedBlock,
  validateDedicatedExclusivePayload,
  buildTenantScheduleJsonDedicatedExclusive,
  weeklyWindowsOverlapSimple,
  dedicatedExclusiveSchedulesOverlap,
  weekdayKeyInTimeZone,
  hhmmInTimeZone,
  ALLOWED_WEEKDAY,
};
