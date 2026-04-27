'use strict';

const { isProviderFirstNetworkEnabled } = require('./providerFirstNetwork');
const { normalizeEmail } = require('./providerIdentityMerge');

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

/**
 * Mesma lógica que `resolveMergedProviderIdentityForUserId`: o `User` pode ter `appAccountId` null
 * mas existir `AppAccount` pelo e‑mail da sessão JWT — sem isto só se vê uma PI e o mapa tenant×User
 * da reconciliação fica incompleto.
 *
 * @param {import('@prisma/client').PrismaClient} client
 * @param {string} userId
 * @param {string} [jwtEmailNorm]
 * @returns {Promise<string|null>}
 */
async function resolveAppAccountIdFromSession(client, userId, jwtEmailNorm = '') {
  const sessionUser = await client.user.findUnique({
    where: { id: String(userId) },
    select: { appAccountId: true, email: true },
  });
  let appAccountId = sessionUser?.appAccountId || null;
  if (!appAccountId && jwtEmailNorm) {
    const acc = await client.appAccount.findUnique({
      where: { emailNorm: String(jwtEmailNorm).trim().toLowerCase() },
      select: { id: true },
    });
    if (acc) appAccountId = acc.id;
  }
  if (!appAccountId && sessionUser?.email) {
    const acc = await client.appAccount.findUnique({
      where: { emailNorm: normalizeEmail(sessionUser.email) },
      select: { id: true },
    });
    if (acc) appAccountId = acc.id;
  }
  return appAccountId ? String(appAccountId) : null;
}

/**
 * Todas as `ProviderIdentity` ligadas ao mesmo `AppAccount` que `userId` (contas fundidas).
 * `jwtEmailNorm` alinha com a fusão de identidade na app (obrigatório quando `appAccountId` na BD é null).
 *
 * @param {import('@prisma/client').PrismaClient} client
 * @param {string} userId
 * @param {string} [jwtEmailNorm]
 * @returns {Promise<string[]>}
 */
async function listProviderIdentityIdsForUserAppAccount(client, userId, jwtEmailNorm = '') {
  const uid = String(userId || '').trim();
  if (!uid) return [];
  const appAccountId = await resolveAppAccountIdFromSession(client, uid, jwtEmailNorm);
  if (appAccountId) {
    const users = await client.user.findMany({
      where: { appAccountId: String(appAccountId) },
      select: { id: true },
    });
    const userIds = users.map((x) => x.id);
    const pis = await client.providerIdentity.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    return pis.map((p) => String(p.id));
  }
  const pi = await client.providerIdentity.findUnique({
    where: { userId: uid },
    select: { id: true },
  });
  return pi?.id ? [String(pi.id)] : [];
}

/**
 * Corpo comum: aplica estado na afiliação consoante o próximo estado do técnico.
 *
 * @param {string} technicianStatusUpper
 * @param {Date} now
 */
function affiliationPayloadForTechnicianNotActive(technicianStatusUpper, now) {
  const next = String(technicianStatusUpper || '').toUpperCase();
  if (next === 'SUSPENDED') {
    return { status: 'SUSPENDED', suspendedAt: now };
  }
  return { status: 'INACTIVE', endedAt: now, suspendedAt: null };
}

/**
 * O painel pode mostrar o colaborador «inativo» só com `User.isActive === false` enquanto
 * `TechnicianProfile` continua ACTIVE. Para afiliações / app, o estado operacional segue os dois.
 *
 * @param {string|undefined} technicianStatusUpper
 * @param {boolean|undefined} userIsActive — `false` = utilizador desativado no painel
 * @returns {string}
 */
function effectiveTechnicianStatusUpperForAffiliation(technicianStatusUpper, userIsActive) {
  if (userIsActive === false) return 'INACTIVE';
  return String(technicianStatusUpper || '').toUpperCase();
}

/**
 * Após alterar o estado do prestador no painel para **este** utilizador, alinha só as afiliações
 * da `ProviderIdentity` dele (não mexe no mesmo AppAccount noutros `User`/empresa).
 *
 * @param {import('@prisma/client').PrismaClient} client
 * @param {string} userId
 * @param {string} technicianStatus
 */
async function downsyncAffiliationsForSingleUserTechnician(client, userId, technicianStatus) {
  const next = String(technicianStatus || '').toUpperCase();
  if (next === 'ACTIVE') return { skipped: 'technician_active' };
  const uid = String(userId || '').trim();
  if (!uid) return { skipped: 'no_user' };

  const pi = await client.providerIdentity.findUnique({
    where: { userId: uid },
    select: { id: true },
  });
  if (!pi?.id) return { skipped: 'no_provider_identity' };

  const now = new Date();
  const data = affiliationPayloadForTechnicianNotActive(next, now);

  const res = await client.providerTenantAffiliation.updateMany({
    where: {
      providerIdentityId: String(pi.id),
      status: { in: ['ACTIVE', 'SUSPENDED', 'REQUESTED'] },
    },
    data,
  });
  return { ok: true, updated: res.count };
}

/**
 * Parcerias **entre tenants** (convite + mesma AppAccount): a linha `ProviderTenantAffiliation`
 * pode estar na PI do User «casa» (ex. Lan) com `tenantId` = outra empresa (ex. BrSpark).
 * O `TechnicianProfile` relevante para «estar ativo na BrSpark» é o do User cuja home tenant
 * é BrSpark — não o dono da PI. Sem este passo, com Lan ACTIVE e BrSpark INACTIVE no painel,
 * a app continuava a mostrar BrSpark «Ativo».
 *
 * @param {import('@prisma/client').PrismaClient} client
 * @param {string} sessionUserId
 * @param {string[]} piIds
 * @returns {Promise<number>}
 */
async function reconcileCrossTenantPartnerAffiliationsForAppAccount(
  client,
  sessionUserId,
  piIds,
  jwtEmailNorm = ''
) {
  const appAccountId = await resolveAppAccountIdFromSession(client, String(sessionUserId), jwtEmailNorm);
  if (!appAccountId) return 0;

  const siblings = await client.user.findMany({
    where: { appAccountId: String(appAccountId) },
    select: { id: true, tenantId: true },
  });
  if (!siblings.length) return 0;
  const tenantToHomeUserId = new Map(siblings.map((s) => [String(s.tenantId), String(s.id)]));

  const affs = await client.providerTenantAffiliation.findMany({
    where: {
      providerIdentityId: { in: piIds },
      status: { in: ['ACTIVE', 'SUSPENDED', 'REQUESTED'] },
    },
    select: {
      id: true,
      tenantId: true,
      providerIdentityId: true,
      relationshipType: true,
    },
  });
  if (!affs.length) return 0;

  const piNeed = [...new Set(affs.map((a) => String(a.providerIdentityId)))];
  const piRows = await client.providerIdentity.findMany({
    where: { id: { in: piNeed } },
    select: { id: true, userId: true },
  });
  const piOwnerUserId = new Map(piRows.map((p) => [String(p.id), String(p.userId)]));

  let updated = 0;
  const now = new Date();
  for (const aff of affs) {
    const rel = String(aff.relationshipType || '').toUpperCase();
    if (rel === 'OWNER') continue;

    const tid = String(aff.tenantId || '').trim();
    const homeUserId = tenantToHomeUserId.get(tid);
    if (!homeUserId) continue;
    const piUid = piOwnerUserId.get(String(aff.providerIdentityId));
    if (!piUid || piUid === homeUserId) continue;

    const [tp, homeUser] = await Promise.all([
      client.technicianProfile.findUnique({
        where: { userId: String(homeUserId) },
        select: { status: true },
      }),
      client.user.findUnique({
        where: { id: String(homeUserId) },
        select: { isActive: true },
      }),
    ]);
    if (!homeUser || homeUser.isActive === false) {
      const data = affiliationPayloadForTechnicianNotActive('INACTIVE', now);
      const res = await client.providerTenantAffiliation.updateMany({
        where: { id: aff.id },
        data,
      });
      updated += res.count;
      continue;
    }
    if (!tp) continue;
    const st = effectiveTechnicianStatusUpperForAffiliation(
      String(tp.status || '').toUpperCase(),
      homeUser.isActive
    );
    if (st === 'ACTIVE') continue;

    const data = affiliationPayloadForTechnicianNotActive(st, now);
    const res = await client.providerTenantAffiliation.updateMany({
      where: { id: aff.id },
      data,
    });
    updated += res.count;
  }
  return updated;
}

/**
 * Garantia por id: aplica a mesma regra (dono da PI vs User «casa» da tenant da linha / AppAccount)
 * **a cada vínculo que o merge devolve à app**. Cobre PI em falta em `listProviderIdentityIds` ou
 * tipos/maiúsculas diferentes na coluna `relationshipType`.
 *
 * @param {import('@prisma/client').PrismaClient} client
 * @param {string[]} affiliationIds
 * @param {string} sessionUserId
 * @param {string} [jwtEmailNorm]
 * @returns {Promise<{ updated: number }>}
 */
async function reconcileAffiliationRowsByIds(client, affiliationIds, sessionUserId, jwtEmailNorm = '') {
  const ids = [...new Set((affiliationIds || []).map(String).filter(Boolean))];
  if (!ids.length) return { updated: 0 };

  const appAccountId = await resolveAppAccountIdFromSession(client, String(sessionUserId), jwtEmailNorm);
  const tenantToHomeUserId = new Map();
  if (appAccountId) {
    const siblings = await client.user.findMany({
      where: { appAccountId: String(appAccountId) },
      select: { id: true, tenantId: true },
    });
    for (const s of siblings) tenantToHomeUserId.set(String(s.tenantId), String(s.id));
  }

  let updated = 0;
  const now = new Date();
  for (const affId of ids) {
    const row = await client.providerTenantAffiliation.findUnique({
      where: { id: String(affId) },
      select: {
        id: true,
        tenantId: true,
        providerIdentityId: true,
        status: true,
        relationshipType: true,
      },
    });
    if (!row) continue;
    const rel = String(row.relationshipType || '').toUpperCase();
    if (rel === 'OWNER') continue;
    const st = String(row.status || '').toUpperCase();
    if (!['ACTIVE', 'SUSPENDED', 'REQUESTED'].includes(st)) continue;

    const pi = await client.providerIdentity.findUnique({
      where: { id: String(row.providerIdentityId) },
      select: { userId: true },
    });
    if (!pi?.userId) continue;
    const piOwner = String(pi.userId);

    const tid = String(row.tenantId || '').trim();
    const homeId = tenantToHomeUserId.get(tid);
    let techUserId = piOwner;
    if (homeId && homeId !== piOwner) techUserId = homeId;

    const [tp, homeUser] = await Promise.all([
      client.technicianProfile.findUnique({
        where: { userId: String(techUserId) },
        select: { status: true },
      }),
      client.user.findUnique({
        where: { id: String(techUserId) },
        select: { isActive: true },
      }),
    ]);
    if (!homeUser || homeUser.isActive === false) {
      const data = affiliationPayloadForTechnicianNotActive('INACTIVE', now);
      const res = await client.providerTenantAffiliation.updateMany({
        where: { id: row.id },
        data,
      });
      updated += res.count;
      continue;
    }
    if (!tp) continue;
    const techSt = effectiveTechnicianStatusUpperForAffiliation(
      String(tp.status || '').toUpperCase(),
      homeUser.isActive
    );
    if (techSt === 'ACTIVE') continue;

    const data = affiliationPayloadForTechnicianNotActive(techSt, now);
    const res = await client.providerTenantAffiliation.updateMany({
      where: { id: row.id },
      data,
    });
    updated += res.count;
  }
  return { updated };
}

/**
 * Na app, o mesmo e-mail pode ter vários `User` (várias PIs) no mesmo `AppAccount`. O estado do
 * `TechnicianProfile` é **por linha User** — alinhamos afiliações **por PI** ao perfil do dono da PI,
 * e num segundo passo as parcerias **cujo tenant da linha** corresponde a outro User do mesmo
 * `AppAccount` (parceria cruzada).
 *
 * @param {import('@prisma/client').PrismaClient} client
 * @param {string} sessionUserId
 * @param {string} [jwtEmailNorm] — e‑mail normalizado da sessão (mesmo critério que a fusão de PIs)
 * @returns {Promise<{ ok?: true, skipped?: string, updated: number }>}
 */
async function reconcileAffiliationsToTechnicianProfilesForAppAccount(
  client,
  sessionUserId,
  jwtEmailNorm = ''
) {
  const piIds = await listProviderIdentityIdsForUserAppAccount(client, sessionUserId, jwtEmailNorm);
  if (!piIds.length) return { skipped: 'no_provider_identity', updated: 0 };

  let updated = 0;
  const now = new Date();
  for (const piId of piIds) {
    const pi = await client.providerIdentity.findUnique({
      where: { id: String(piId) },
      select: { userId: true },
    });
    if (!pi?.userId) continue;

    const [tp, homeUser] = await Promise.all([
      client.technicianProfile.findUnique({
        where: { userId: String(pi.userId) },
        select: { status: true },
      }),
      client.user.findUnique({
        where: { id: String(pi.userId) },
        select: { isActive: true },
      }),
    ]);
    if (!homeUser || homeUser.isActive === false) {
      const data = affiliationPayloadForTechnicianNotActive('INACTIVE', now);
      const res = await client.providerTenantAffiliation.updateMany({
        where: {
          providerIdentityId: String(piId),
          status: { in: ['ACTIVE', 'SUSPENDED', 'REQUESTED'] },
        },
        data,
      });
      updated += res.count;
      continue;
    }
    if (!tp) continue;
    const st = effectiveTechnicianStatusUpperForAffiliation(
      String(tp.status || '').toUpperCase(),
      homeUser.isActive
    );
    if (st === 'ACTIVE') continue;

    const data = affiliationPayloadForTechnicianNotActive(st, now);
    const res = await client.providerTenantAffiliation.updateMany({
      where: {
        providerIdentityId: String(piId),
        status: { in: ['ACTIVE', 'SUSPENDED', 'REQUESTED'] },
      },
      data,
    });
    updated += res.count;
  }

  updated += await reconcileCrossTenantPartnerAffiliationsForAppAccount(
    client,
    sessionUserId,
    piIds,
    jwtEmailNorm
  );

  return { ok: true, updated };
}

/**
 * Última linha de defesa na resposta à app: recalcula `status` de cada vínculo a partir do
 * `TechnicianProfile` + `User.isActive` do utilizador relevante (dono da PI ou User «casa» na parceria),
 * **substitui** o valor na carga JSON e **persiste** na BD se divergir.
 * Garante que «Ativo» na app não contradiz o painel (técnico inativo ou utilizador desativado).
 *
 * @param {import('@prisma/client').PrismaClient} client
 * @param {unknown[]} rows — afiliações já fundidas (inclui tenant, providerIdentity parcial)
 * @param {string} sessionUserId
 * @param {string} [jwtEmailNorm]
 * @returns {Promise<{ rows: unknown[]; persistedCount: number }>}
 */
async function ensureAffiliationRowStatusesMatchTechnicianProfiles(
  client,
  rows,
  sessionUserId,
  jwtEmailNorm = ''
) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return { rows: [], persistedCount: 0 };

  const appAccountId = await resolveAppAccountIdFromSession(client, String(sessionUserId), jwtEmailNorm);
  const tenantToHomeUserId = new Map();
  if (appAccountId) {
    const siblings = await client.user.findMany({
      where: { appAccountId: String(appAccountId) },
      select: { id: true, tenantId: true },
    });
    for (const s of siblings) {
      tenantToHomeUserId.set(String(s.tenantId), String(s.id));
    }
  }

  const piIds = [...new Set(list.map((r) => String(r.providerIdentityId || '').trim()).filter(Boolean))];
  const pis = await client.providerIdentity.findMany({
    where: { id: { in: piIds } },
    select: { id: true, userId: true },
  });
  const piOwnerById = new Map(pis.map((p) => [String(p.id), String(p.userId)]));

  const techUserIds = new Set();
  for (const row of list) {
    const rel = String(row.relationshipType || '').toUpperCase();
    if (rel === 'OWNER') continue;
    const st0 = String(row.status || '').toUpperCase();
    if (!['ACTIVE', 'SUSPENDED', 'REQUESTED'].includes(st0)) continue;
    const piOwner = piOwnerById.get(String(row.providerIdentityId || '').trim());
    if (!piOwner) continue;
    const tid = String(row.tenantId || '').trim();
    const homeId = tenantToHomeUserId.get(tid);
    let techUid = piOwner;
    if (homeId && homeId !== piOwner) techUid = homeId;
    techUserIds.add(String(techUid));
  }

  const techList = await client.technicianProfile.findMany({
    where: { userId: { in: [...techUserIds] } },
    select: { userId: true, status: true },
  });
  const techStByUserId = new Map(
    techList.map((t) => [String(t.userId), String(t.status || '').toUpperCase()]),
  );
  const userRows =
    techUserIds.size > 0
      ? await client.user.findMany({
          where: { id: { in: [...techUserIds] } },
          select: { id: true, isActive: true },
        })
      : [];
  const userById = new Map(userRows.map((u) => [String(u.id), u]));

  const now = new Date();
  const updates = [];
  const out = [];

  for (const row of list) {
    const rel = String(row.relationshipType || '').toUpperCase();
    let eff = String(row.status || '').toUpperCase();
    let persistTs = null;

    if (
      rel !== 'OWNER' &&
      ['ACTIVE', 'SUSPENDED', 'REQUESTED'].includes(eff) &&
      row.providerIdentityId
    ) {
      const piOwner = piOwnerById.get(String(row.providerIdentityId).trim());
      if (piOwner) {
        const tid = String(row.tenantId || '').trim();
        const homeId = tenantToHomeUserId.get(tid);
        let techUid = piOwner;
        if (homeId && homeId !== piOwner) techUid = homeId;

        const uRow = userById.get(String(techUid));
        const rawTs = techStByUserId.get(String(techUid)) || '';
        const ts = effectiveTechnicianStatusUpperForAffiliation(rawTs, uRow?.isActive);
        if (!uRow) {
          persistTs = 'INACTIVE';
          eff = 'INACTIVE';
        } else if (ts && ts !== 'ACTIVE') {
          persistTs = ts;
          if (ts === 'SUSPENDED') eff = 'SUSPENDED';
          else eff = 'INACTIVE';
        }
      }
    }

    if (persistTs) {
      const dbSt = String(row.status || '').toUpperCase();
      if (eff !== dbSt) {
        updates.push({
          id: String(row.id),
          data: affiliationPayloadForTechnicianNotActive(persistTs, now),
        });
      }
    }

    out.push(
      typeof row === 'object' && row !== null ? { ...row, status: eff } : row
    );
  }

  let persistedCount = 0;
  if (updates.length) {
    await client.$transaction(
      updates.map((u) =>
        client.providerTenantAffiliation.update({
          where: { id: u.id },
          data: u.data,
        })
      )
    );
    persistedCount = updates.length;
  }

  return { rows: out, persistedCount };
}

module.exports = {
  ensureProviderIdentityForUserId,
  syncActiveAffiliationFromTechnicianStatus,
  resolveAppAccountIdFromSession,
  listProviderIdentityIdsForUserAppAccount,
  affiliationPayloadForTechnicianNotActive,
  downsyncAffiliationsForSingleUserTechnician,
  reconcileCrossTenantPartnerAffiliationsForAppAccount,
  reconcileAffiliationRowsByIds,
  reconcileAffiliationsToTechnicianProfilesForAppAccount,
  ensureAffiliationRowStatusesMatchTechnicianProfiles,
};
