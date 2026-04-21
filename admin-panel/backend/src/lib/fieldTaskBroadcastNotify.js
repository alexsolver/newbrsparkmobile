'use strict';

const { sendFieldTaskActivityPushToAssignee } = require('./fieldTaskAssigneePush');
const { resolveTenantAppDisplayName } = require('./mobileTenantBranding');

/**
 * Avisa técnicos que não ganharam o leilão (OS já atribuída a outro).
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

  const appDisplayName = await resolveTenantAppDisplayName(prisma, templateTenantId, 'BrSpark');

  let total = 0;
  for (const em of losers) {
    const raw = String(em || '').trim();
    if (!raw) continue;
    const r = await sendFieldTaskActivityPushToAssignee(prisma, {
      ownerEmail: raw,
      templateTenantId,
      assigneeTenantId: null,
      executionId,
      pushTitle: 'OS atribuída a outro técnico',
      pushBody: `${osLabel}: outro prestador aceitou primeiro.`.slice(0, 180),
      pushSubtitle: 'A OS foi removida da sua lista pendente.',
      logLabel: 'BROADCAST_LOST',
      extraData: {
        type: 'os_broadcast_taken',
        taskId: executionId,
        appDisplayName,
      },
    });
    total += Number(r?.sent) || 0;
  }
  return { sent: total };
}

module.exports = {
  notifyBroadcastLosers,
};
