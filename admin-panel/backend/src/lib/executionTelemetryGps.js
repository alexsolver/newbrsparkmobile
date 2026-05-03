'use strict';
const { Prisma } = require('@prisma/client');
const prisma = require('../db');

function isSafeExecutionId(id) {
  return typeof id === 'string' && /^[a-z0-9_-]{12,64}$/i.test(id);
}

/** Map executionId → idade em segundos do último evento com lat/lng (uma query em lote). */
async function latestGpsAgeSecondsByExecutionIds(ids) {
  const safe = [...new Set(ids)].filter(isSafeExecutionId);
  if (!safe.length) return new Map();
  try {
    const rows = await prisma.$queryRaw`
      SELECT DISTINCT ON ("executionId") "executionId",
        LEAST(
          2147483647,
          GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE("deviceTimestamp", "serverTimestamp")))::double precision)
          )
        )::integer AS "ageSec"
      FROM "TelemetryEvent"
      WHERE "executionId" IN (${Prisma.join(safe)})
        AND "lat" IS NOT NULL
        AND "lng" IS NOT NULL
      ORDER BY "executionId", COALESCE("deviceTimestamp", "serverTimestamp") DESC
    `;
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
