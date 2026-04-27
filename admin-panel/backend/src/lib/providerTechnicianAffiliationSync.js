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
 * cria `ProviderTenantAffiliation` ACTIVE em falta (backfill) — senão a app «Organizações e parcerias»
 * pode ficar vazia apesar do prestador estar ativo no painel.
 * Não altera linhas já existentes (encerramento/suspensão/convite no painel ou na app prevalecem).
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
  const whereKey = {
    tenantId_providerIdentityId: {
      tenantId: tid,
      providerIdentityId: pi.id,
    },
  };
  const existing = await client.providerTenantAffiliation.findUnique({
    where: whereKey,
    select: { id: true, status: true },
  });
  const st = String(existing?.status || '').toUpperCase();
  // Não reabrir vínculos já encerrados/recusados/suspensos nem avançar convites pelo sync do técnico.
  if (existing) {
    if (st === 'INACTIVE' || st === 'REJECTED') {
      return { skipped: 'affiliation_ended', affiliationId: existing.id };
    }
    if (st === 'SUSPENDED') {
      return { skipped: 'affiliation_suspended', affiliationId: existing.id };
    }
    if (st === 'INVITED' || st === 'REQUESTED') {
      return { skipped: 'affiliation_pending_flow', affiliationId: existing.id };
    }
    if (st === 'ACTIVE') {
      return { ok: true, affiliationId: existing.id };
    }
    return { skipped: 'affiliation_unknown_status', affiliationId: existing.id, status: st };
  }

  const now = new Date();
  const row = await client.providerTenantAffiliation.create({
    data: {
      tenantId: tid,
      providerIdentityId: pi.id,
      status: 'ACTIVE',
      relationshipType: 'PARTNER',
      invitedAt: now,
      requestedAt: now,
      activatedAt: now,
      note: 'Sincronizado ao ativar prestador na tenant (painel).',
    },
  });
  return { ok: true, affiliationId: row.id };
}

module.exports = {
  ensureProviderIdentityForUserId,
  syncActiveAffiliationFromTechnicianStatus,
};
