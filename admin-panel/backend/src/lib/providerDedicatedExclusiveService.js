'use strict';

const {
  parseDedicatedExclusiveFromTenantScheduleJson,
  isInstantInDedicatedBlock,
  dedicatedExclusiveSchedulesOverlap,
} = require('./dedicatedExclusiveTime');
const { normalizeEmail } = require('./fieldTaskExecutionAccess');

/**
 * Todos os `providerIdentityId` ligados ao mesmo `AppAccount` do utilizador (sessão app).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 */
async function resolveProviderIdentityIdsForAppSessionUser(prisma, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return [];
  const u = await prisma.user.findUnique({
    where: { id: uid },
    select: {
      appAccountId: true,
      providerIdentity: { select: { id: true } },
    },
  });
  if (!u) return [];
  const ids = new Set();
  if (u.providerIdentity?.id) ids.add(String(u.providerIdentity.id));
  if (u.appAccountId) {
    const rows = await prisma.providerIdentity.findMany({
      where: { user: { appAccountId: String(u.appAccountId) } },
      select: { id: true },
    });
    for (const r of rows) {
      if (r.id) ids.add(String(r.id));
    }
  }
  return [...ids];
}

/**
 * Em `at`, o prestador (identidade global via sessão) está numa janela de exclusividade do vínculo dedicado?
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {Date} [at]
 */
async function isAppUserInDedicatedExclusiveAt(prisma, userId, at = new Date()) {
  const piIds = await resolveProviderIdentityIdsForAppSessionUser(prisma, userId);
  if (!piIds.length) return false;
  const affs = await prisma.providerTenantAffiliation.findMany({
    where: {
      providerIdentityId: { in: piIds },
      status: 'ACTIVE',
      relationshipType: 'DEDICATED',
    },
    select: { tenantScheduleJson: true },
  });
  for (const a of affs) {
    const p = parseDedicatedExclusiveFromTenantScheduleJson(a.tenantScheduleJson);
    if (isInstantInDedicatedBlock(at, p)) return true;
  }
  return false;
}

/**
 * E-mail canónico de prestador está dedicado em `at`? (despacho broadcast)
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} email
 * @param {Date} at
 */
async function isCanonicalTechnicianEmailDedicatedAt(prisma, email, at) {
  const em = normalizeEmail(email);
  if (!em) return false;
  const acc = await prisma.appAccount.findUnique({
    where: { emailNorm: em },
    select: { id: true },
  });
  if (!acc) {
    const u = await prisma.user.findFirst({
      where: { email: { equals: em, mode: 'insensitive' }, isActive: true },
      select: { id: true },
    });
    if (!u) return false;
    return isAppUserInDedicatedExclusiveAt(prisma, u.id, at);
  }
  const users = await prisma.user.findMany({
    where: { appAccountId: acc.id, isActive: true },
    select: { id: true },
  });
  for (const row of users) {
    if (await isAppUserInDedicatedExclusiveAt(prisma, row.id, at)) return true;
  }
  return false;
}

/**
 * Remove e-mails de candidatos a broadcast que estejam em janela dedicada exclusiva em `at`.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} emails
 * @param {Date} at
 */
async function filterBroadcastCandidatesExcludingDedicatedAt(prisma, emails, at) {
  const out = [];
  for (const raw of emails || []) {
    const e = normalizeEmail(raw);
    if (!e) continue;
    if (await isCanonicalTechnicianEmailDedicatedAt(prisma, e, at)) continue;
    out.push(e);
  }
  return out;
}

/**
 * Exclui candidatos a broadcast com vínculo DEDICATED+ACTIVE noutra empresa que `dispatchTenantId`.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} emails
 * @param {string|null|undefined} dispatchTenantId
 */
async function filterBroadcastCandidatesExcludingDedicatedOtherTenant(prisma, emails, dispatchTenantId) {
  const dt = String(dispatchTenantId || '').trim();
  const out = [];
  for (const raw of emails || []) {
    const e = normalizeEmail(raw);
    if (!e) continue;
    if (dt && (await emailHasActiveDedicatedOtherTenant(prisma, e, dt))) continue;
    out.push(e);
  }
  return out;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} email
 * @param {string} dispatchTenantId
 */
async function emailHasActiveDedicatedOtherTenant(prisma, email, dispatchTenantId) {
  const em = normalizeEmail(email);
  const dt = String(dispatchTenantId || '').trim();
  if (!em || !dt) return false;
  const acc = await prisma.appAccount.findUnique({ where: { emailNorm: em }, select: { id: true } });
  const userWhere = acc
    ? { appAccountId: acc.id, isActive: true }
    : { email: { equals: em, mode: 'insensitive' }, isActive: true };
  const users = await prisma.user.findMany({
    where: userWhere,
    select: { id: true },
  });
  for (const u of users) {
    const pis = await prisma.providerIdentity.findMany({
      where: { userId: u.id },
      select: { id: true },
    });
    for (const pi of pis) {
      const hit = await prisma.providerTenantAffiliation.findFirst({
        where: {
          providerIdentityId: pi.id,
          relationshipType: 'DEDICATED',
          status: 'ACTIVE',
          tenantId: { not: dt },
        },
        select: { id: true },
      });
      if (hit) return true;
    }
  }
  return false;
}

/**
 * Valida que o novo `tenantScheduleJson` (bloco dedicado) não intersecta outras afiliações ACTIVE DEDICATED do mesmo PI.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} providerIdentityId
 * @param {unknown} nextTenantScheduleJson — JSON completo a gravar (com dedicatedExclusive)
 * @param {string|null} excludeAffiliationId
 */
async function assertNoDedicatedOverlapForProviderIdentity(prisma, providerIdentityId, nextTenantScheduleJson, excludeAffiliationId) {
  const pid = String(providerIdentityId || '').trim();
  if (!pid) return { ok: true };
  const nextParsed = parseDedicatedExclusiveFromTenantScheduleJson(nextTenantScheduleJson);
  if (!nextParsed) return { ok: true };

  const others = await prisma.providerTenantAffiliation.findMany({
    where: {
      providerIdentityId: pid,
      status: 'ACTIVE',
      relationshipType: 'DEDICATED',
      ...(excludeAffiliationId ? { id: { not: String(excludeAffiliationId) } } : {}),
    },
    select: { id: true, tenantId: true, tenantScheduleJson: true },
  });
  for (const o of others) {
    const p = parseDedicatedExclusiveFromTenantScheduleJson(o.tenantScheduleJson);
    if (p && dedicatedExclusiveSchedulesOverlap(nextParsed, p)) {
      return {
        ok: false,
        error:
          'Estas janelas dedicadas sobrepõem-se a outro vínculo DEDICATED+ACTIVE do mesmo prestador. Ajuste os horários ou encerre o outro vínculo.',
        conflictAffiliationId: o.id,
        conflictTenantId: o.tenantId,
      };
    }
  }
  return { ok: true };
}

/**
 * Diretório público: ocultar se existir vínculo ACTIVE+DEDICATED (prestador não está no pool global).
 *
 * @param {{ affiliations?: Array<{ status?: string, relationshipType?: string, tenantScheduleJson?: unknown }> } | null} providerIdentity
 * @param {Date} [at]
 */
function isHiddenFromPublicDirectoryAt(providerIdentity, at = new Date()) {
  const list = Array.isArray(providerIdentity?.affiliations) ? providerIdentity.affiliations : [];
  for (const aff of list) {
    if (String(aff.relationshipType || '').toUpperCase() !== 'DEDICATED') continue;
    if (String(aff.status || '').toUpperCase() !== 'ACTIVE') continue;
    // Com vínculo dedicado activo, o prestador não entra no «pool» público de outras empresas.
    return true;
  }
  return false;
}

/**
 * Diretório painel empresa: ocultar ao `viewerTenantId` quando o prestador tem ACTIVE+DEDICATED com **outra** empresa.
 * A empresa do vínculo dedicado continua a ver o prestador.
 *
 * @param {{ affiliations?: Array<{ tenantId?: string, status?: string, relationshipType?: string, tenantScheduleJson?: unknown }> } | null} providerIdentity
 * @param {string|null|undefined} viewerTenantId
 * @param {Date} [at]
 */
function isHiddenFromCompanyDirectoryAt(providerIdentity, viewerTenantId, at = new Date()) {
  const vt = String(viewerTenantId || '').trim();
  if (!vt) return false;
  const list = Array.isArray(providerIdentity?.affiliations) ? providerIdentity.affiliations : [];
  for (const aff of list) {
    if (String(aff.relationshipType || '').toUpperCase() !== 'DEDICATED') continue;
    if (String(aff.status || '').toUpperCase() !== 'ACTIVE') continue;
    const dedicatedTid = String(aff.tenantId || '').trim();
    if (dedicatedTid && dedicatedTid === vt) continue;
    return true;
  }
  return false;
}

module.exports = {
  resolveProviderIdentityIdsForAppSessionUser,
  isAppUserInDedicatedExclusiveAt,
  isCanonicalTechnicianEmailDedicatedAt,
  filterBroadcastCandidatesExcludingDedicatedAt,
  filterBroadcastCandidatesExcludingDedicatedOtherTenant,
  emailHasActiveDedicatedOtherTenant,
  assertNoDedicatedOverlapForProviderIdentity,
  isHiddenFromPublicDirectoryAt,
  isHiddenFromCompanyDirectoryAt,
};
