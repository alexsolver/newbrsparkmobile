'use strict';

const { sendFieldTaskActivityPushToAssignees } = require('./fieldTaskAssigneePush');
const { resolveTenantAppDisplayName } = require('./mobileTenantBranding');

/**
 * Avisa prestadores que não ganharam o leilão (OS já atribuída a outro).
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function notifyBroadcastLosers(prisma, opts) {
  const winnerEmail = String(opts?.winnerEmail || '').trim();
  const loserEmails = Array.isArray(opts?.loserEmails) ? opts.loserEmails.map((e) => String(e || '').trim()).filter(Boolean) : [];
  const executionId = String(opts?.executionId || '').trim();
  const templateTenantId = opts?.templateTenantId != null ? opts.templateTenantId : null;
  const osLabel = String(opts?.osLabel || 'OS').slice(0, 80);

  const losers = [...new Set(loserEmails.map((e) => e.toLowerCase()))].filter(
    (e) => e && e !== winnerEmail.toLowerCase()
  );
  if (!executionId || losers.length === 0) return { sent: 0 };

  const appDisplayName = await resolveTenantAppDisplayName(prisma, templateTenantId, 'Aria');

  const r = await sendFieldTaskActivityPushToAssignees(prisma, {
    ownerEmails: losers,
    templateTenantId,
    assigneeTenantId: null,
    executionId,
    pushTitle: 'Essa OS não está mais disponível',
    pushBody: `${osLabel}: a ordem já foi atribuída a outro prestador.`.slice(0, 180),
    pushSubtitle: 'A OS foi removida da sua lista pendente.',
    logLabel: 'BROADCAST_LOST',
    extraData: {
      type: 'os_broadcast_taken',
      taskId: executionId,
      appDisplayName,
    },
  });
  return { sent: Number(r?.sent) || 0 };
}

module.exports = {
  notifyBroadcastLosers,
};
