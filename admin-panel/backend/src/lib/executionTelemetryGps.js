'use strict';
const prisma = require('../db');

function isSafeExecutionId(id) {
  return typeof id === 'string' && /^[a-z0-9_-]{12,64}$/i.test(id);
}

/** Map executionId → idade em segundos do último evento com lat/lng (uma query em lote). */
async function latestGpsAgeSecondsByExecutionIds(ids) {
  const safe = [...new Set(ids)].filter(isSafeExecutionId);
  if (!safe.length) return new Map();
  try {
    const list = safe.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
    const rows = await prisma.$queryRawUnsafe(`
      SELECT DISTINCT ON ("executionId") "executionId",
        LEAST(2147483647, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - "serverTimestamp")))::int)) AS "ageSec"
      FROM "TelemetryEvent"
      WHERE "executionId" IN (${list})
        AND "lat" IS NOT NULL
        AND "lng" IS NOT NULL
      ORDER BY "executionId", "serverTimestamp" DESC
    `);
    const m = new Map();
    for (const r of rows) {
      if (r.executionId != null && r.ageSec != null) {
        const n = Number(r.ageSec);
        if (Number.isFinite(n)) m.set(r.executionId, n);
      }
    }
    return m;
  } catch (e) {
    console.warn('[executionTelemetryGps] batch:', e.message);
    return new Map();
  }
}

module.exports = { isSafeExecutionId, latestGpsAgeSecondsByExecutionIds };
