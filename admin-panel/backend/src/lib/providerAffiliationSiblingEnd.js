'use strict';

/**
 * Vários `User` com o mesmo `AppAccount` têm `ProviderIdentity` distintos; cada um pode ter
 * `ProviderTenantAffiliation` para o mesmo `tenantId`. Encerrar só uma linha deixava outra ACTIVE
 * (app mostrava «Ativo», painel outra linha «Inativo»).
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {{ tenantId: string, excludeAffiliationId: string, appAccountId: string, now?: Date }} opts
 * @returns {Promise<number>} número de linhas irmãs atualizadas
 */
async function endSiblingAffiliationsSameTenantAppAccount(client, opts) {
  const tenantId = String(opts.tenantId || '').trim();
  const excludeAffiliationId = String(opts.excludeAffiliationId || '').trim();
  const appAccountId = String(opts.appAccountId || '').trim();
  const now = opts.now instanceof Date ? opts.now : new Date();
  if (!tenantId || !excludeAffiliationId || !appAccountId) return 0;

  const res = await client.providerTenantAffiliation.updateMany({
    where: {
      tenantId,
      id: { not: excludeAffiliationId },
      providerIdentity: { user: { appAccountId } },
      status: { in: ['ACTIVE', 'SUSPENDED', 'REQUESTED', 'INVITED'] },
    },
    data: {
      status: 'INACTIVE',
      endedAt: now,
      suspendedAt: null,
      invitationToken: null,
    },
  });
  return Number(res.count || 0);
}

module.exports = {
  endSiblingAffiliationsSameTenantAppAccount,
};
