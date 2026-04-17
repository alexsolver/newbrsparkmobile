'use strict';

const prisma = require('../db');

const PROVIDER_FIRST_NETWORK_FLAG_KEY = 'provider_first_network';

async function isProviderFirstNetworkEnabled(tenantId) {
  const global = await prisma.featureFlag.findFirst({
    where: { key: PROVIDER_FIRST_NETWORK_FLAG_KEY, tenantId: null },
  });
  const globalEnabled = global ? !!global.enabled : false;
  if (!tenantId) return globalEnabled;
  const override = await prisma.featureFlag.findFirst({
    where: { key: PROVIDER_FIRST_NETWORK_FLAG_KEY, tenantId: String(tenantId) },
  });
  if (override) return !!override.enabled;
  return globalEnabled;
}

module.exports = {
  PROVIDER_FIRST_NETWORK_FLAG_KEY,
  isProviderFirstNetworkEnabled,
};
