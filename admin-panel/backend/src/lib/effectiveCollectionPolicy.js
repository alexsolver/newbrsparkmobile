'use strict';

const prisma = require('../db');
const { normalizeGpsCapturePolicy } = require('./gpsCapturePolicy');

/**
 * GPS efetivo: política global + campos do override do tenant (se existir).
 * @param {unknown} globalRaw
 * @param {unknown} overrideRaw
 */
function mergeGpsCapturePolicyForEffective(globalRaw, overrideRaw) {
  const base = normalizeGpsCapturePolicy(globalRaw);
  if (overrideRaw == null) return base;
  if (typeof overrideRaw !== 'object' || Array.isArray(overrideRaw)) return base;
  return normalizeGpsCapturePolicy({ ...base, .../** @type {Record<string, unknown>} */ (overrideRaw) });
}

/**
 * Política efetiva de coleta (global + override tenant/setor) e `gpsCapturePolicy` já mesclado.
 * @param {string|null} tenantId
 * @param {string|null} sectorCode
 */
async function getEffectivePolicy(tenantId, sectorCode) {
  let global = await prisma.collectionPolicy.findFirst({
    where: { tenantId: null, sectorCode: null, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!global) {
    global = await prisma.collectionPolicy.create({
      data: { tenantId: null, sectorCode: null, label: 'Padrão Global', isActive: true },
    });
  }

  const withGps = (base, overrideRow) => {
    const out = { ...base };
    out.gpsCapturePolicy = mergeGpsCapturePolicyForEffective(
      global.gpsCapturePolicy,
      overrideRow == null ? null : overrideRow.gpsCapturePolicy,
    );
    return out;
  };

  if (!tenantId) {
    return withGps({ ...global, _source: 'global' }, null);
  }

  const tenantSector = sectorCode
    ? await prisma.collectionPolicy.findFirst({
        where: { tenantId, sectorCode, isActive: true },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  const tenantOnly = await prisma.collectionPolicy.findFirst({
    where: { tenantId, sectorCode: null, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  const override = tenantSector || tenantOnly;
  if (!override) {
    return withGps({ ...global, _source: 'global' }, null);
  }

  return withGps(
    {
      ...global,
      ...override,
      id: override.id,
      _source: tenantSector ? 'tenant_sector' : 'tenant',
      _globalId: global.id,
    },
    override,
  );
}

module.exports = {
  getEffectivePolicy,
  mergeGpsCapturePolicyForEffective,
};
