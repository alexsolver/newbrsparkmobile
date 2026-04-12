'use strict';

/** Fuso usado no relatório admin para agrupar “dia” (alinhado ao uso comum em pt-BR). */
const REPORT_DAY_TZ = 'America/Sao_Paulo';

const KNOWN = new Set(['CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END']);

function dayKeyInTz(iso, tz) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: tz });
}

function normalizeType(t) {
  const u = String(t || '').toUpperCase();
  return KNOWN.has(u) ? u : '';
}

function accumulatedWorkedMsFromSorted(sorted) {
  let phase = 'out';
  let segmentStart = null;
  let total = 0;
  for (const row of sorted) {
    const ty = normalizeType(row.type);
    if (!ty) continue;
    const t = new Date(row.deviceTimestamp).getTime();
    if (Number.isNaN(t)) continue;
    switch (ty) {
      case 'CLOCK_IN':
        phase = 'in';
        segmentStart = t;
        break;
      case 'CLOCK_OUT':
        if (phase === 'in' && segmentStart != null) total += Math.max(0, t - segmentStart);
        phase = 'out';
        segmentStart = null;
        break;
      case 'BREAK_START':
        if (phase === 'in' && segmentStart != null) {
          total += Math.max(0, t - segmentStart);
          segmentStart = null;
        }
        phase = 'break';
        break;
      case 'BREAK_END':
        if (phase === 'break') {
          phase = 'in';
          segmentStart = t;
        }
        break;
      default:
        break;
    }
  }
  return total;
}

function formatWorkedHm(ms) {
  const totalMin = Math.max(0, Math.floor(Number(ms) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/**
 * Anexa `accumulatedWorkDayMs` e `accumulatedWorkDayLabel` a cada linha (mutação).
 * @param {Array<{ id: string, userId: string, deviceTimestamp: Date|string, type: string }>} rows
 */
async function attachAccumulatedWorkDayForReportRows(rows, prisma, tenantId, tz = REPORT_DAY_TZ) {
  if (!rows || rows.length === 0) return;
  const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
  if (userIds.length === 0) return;

  let minT = Infinity;
  let maxT = -Infinity;
  for (const r of rows) {
    const t = new Date(r.deviceTimestamp).getTime();
    if (!Number.isNaN(t)) {
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    }
  }
  if (!Number.isFinite(minT)) return;

  const padMs = 48 * 3600 * 1000;
  const from = new Date(minT - padMs);
  const to = new Date(maxT + padMs);

  const allPunches = await prisma.workTimePunch.findMany({
    where: {
      tenantId,
      userId: { in: userIds },
      deviceTimestamp: { gte: from, lte: to },
    },
    select: {
      id: true,
      userId: true,
      deviceTimestamp: true,
      type: true,
    },
  });

  const byBucket = new Map();
  for (const p of allPunches) {
    const dk = dayKeyInTz(p.deviceTimestamp, tz);
    const key = `${p.userId}|${dk}`;
    if (!byBucket.has(key)) byBucket.set(key, []);
    byBucket.get(key).push(p);
  }
  for (const list of byBucket.values()) {
    list.sort((a, b) => new Date(a.deviceTimestamp) - new Date(b.deviceTimestamp));
  }

  for (const r of rows) {
    const dk = dayKeyInTz(r.deviceTimestamp, tz);
    const key = `${r.userId}|${dk}`;
    const bucket = byBucket.get(key) || [];
    const pivotTs = new Date(r.deviceTimestamp).getTime();
    const subset = bucket.filter((p) => new Date(p.deviceTimestamp).getTime() <= pivotTs);
    subset.sort((a, b) => new Date(a.deviceTimestamp) - new Date(b.deviceTimestamp));
    const ms = accumulatedWorkedMsFromSorted(subset);
    r.accumulatedWorkDayMs = ms;
    r.accumulatedWorkDayLabel = formatWorkedHm(ms);
  }
}

function punchRecordStatusToneServer(p) {
  if (p.exceptionRegistration) return 'caution';
  if (p.faceEnrollmentInvalid === true) return 'caution';
  return 'success';
}

module.exports = {
  attachAccumulatedWorkDayForReportRows,
  punchRecordStatusToneServer,
  formatWorkedHm,
  REPORT_DAY_TZ,
};
