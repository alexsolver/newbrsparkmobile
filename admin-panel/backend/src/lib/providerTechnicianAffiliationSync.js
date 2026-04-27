'use strict';

const { isProviderFirstNetworkEnabled } = require('./providerFirstNetwork');

/**
 * @param {import('@prisma/client').PrismaClient} client
 * @param {string} userId
 * @param {string} [profileSource]
 */
async function ensureProviderIdentityForUserId(client, userId, profileSource = 'provider_first_onboarding') {
  return client.providerIdentity.upsert({
    where: { userId: String(userId) },
    create: {
      userId: String(userId),
      globalStatus: 'PENDING',
      kycStatus: 'PENDING',
      profileJson: { source: profileSource },
    },
    update: {},
  });
}

/**
 * Quando o perfil técnico está ACTIVE na tenant empresa e provider-first está activo,
 * garante `ProviderTenantAffiliation` ACTIVE — senão a app «Organizações e parcerias» fica vazia
 * apesar do prestador estar ativo no painel.
 *
 * @param {import('@prisma/client').PrismaClient} client
 * @param {{ userId: string, tenantId: string, tenantKind?: string|null }} opts
 * @returns {Promise<{ ok?: true, affiliationId?: string, skipped?: string }>}
 */
async function syncActiveAffiliationFromTechnicianStatus(client, opts) {
  const kind = String(opts.tenantKind || 'COMPANY').toUpperCase();
  if (kind !== 'COMPANY') return { skipped: 'non_company_tenant' };
  const tid = String(opts.tenantId || '').trim();
  if (!tid) return { skipped: 'no_tenant' };
  const uid = String(opts.userId || '').trim();
  if (!uid) return { skipped: 'no_user' };

  const enabled = await isProviderFirstNetworkEnabled(tid);
  if (!enabled) return { skipped: 'provider_first_off' };

  const pi = await ensureProviderIdentityForUserId(client, uid, 'technician_active_tenant_sync');
  const now = new Date();
  const row = await client.providerTenantAffiliation.upsert({
    where: {
      tenantId_providerIdentityId: {
        tenantId: tid,
        providerIdentityId: pi.id,
      },
    },
    create: {
      tenantId: tid,
      providerIdentityId: pi.id,
      status: 'ACTIVE',
      relationshipType: 'PARTNER',
      invitedAt: now,
      requestedAt: now,
      activatedAt: now,
      note: 'Sincronizado ao ativar prestador na tenant (painel).',
    },
    update: {
      status: 'ACTIVE',
      endedAt: null,
      activatedAt: now,
      requestedAt: now,
    },
  });
  return { ok: true, affiliationId: row.id };
}

module.exports = {
  ensureProviderIdentityForUserId,
  syncActiveAffiliationFromTechnicianStatus,
};
