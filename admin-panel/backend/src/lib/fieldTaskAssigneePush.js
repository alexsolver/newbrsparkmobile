'use strict';

const { sendExpoPushToMany } = require('../services/expoPush');
const { resolveGlobalLiveActivityBadgeKey, resolveTenantAppDisplayName } = require('./mobileTenantBranding');

/**
 * Push ao técnico (mesmo payload que despacho de OS: categorias/botões no app).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   ownerEmail: string,
 *   templateTenantId?: string|null,
 *   assigneeTenantId?: string|null,
 *   executionId: string,
 *   pushTitle: string,
 *   pushBody: string,
 *   pushSubtitle?: string|null,
 *   logLabel?: string,
 *   extraData?: Record<string, string|undefined> — funde em `data` do Expo (ex.: type alternativo).
 * }} opts
 * @returns {Promise<{ sent: number, skipped?: string }>}
 */
async function sendFieldTaskActivityPushToAssignee(prisma, opts) {
  const emailRaw = String(opts.ownerEmail || '').trim();
  const executionId = String(opts.executionId || '').trim();
  if (!emailRaw || !executionId) {
    return { sent: 0, skipped: 'bad_args' };
  }

  const emailFilter = { equals: emailRaw, mode: 'insensitive' };
  const templateTid = opts.templateTenantId || null;
  const assigneeTid = opts.assigneeTenantId || null;

  const label = opts.logLabel || 'fieldTaskPush';
  const appDisplayName = await resolveTenantAppDisplayName(
    prisma,
    assigneeTid || templateTid || null,
    'BrSpark'
  );
  const liveActivityBadgeKey = await resolveGlobalLiveActivityBadgeKey(prisma, 'brspark-badge');

  /** Todas as contas ativas com este e-mail (case-insensitive). */
  const allEmailRows = await prisma.user.findMany({
    where: { isActive: true, email: emailFilter },
    select: { id: true, tenantId: true },
  });

  if (allEmailRows.length === 0) {
    console.warn(`[${label}] Push ignorado: nenhum usuário ativo:`, emailRaw);
    return { sent: 0, skipped: 'no_user' };
  }
  if (allEmailRows.length > 1) {
    console.warn(`[${label}] Vários usuários ativos com o mesmo e-mail (${allEmailRows.length}):`, emailRaw);
  }

  const preferTid = String(assigneeTid || templateTid || '').trim();
  /** Preferir tenant da OS/template; o token Expo pode estar noutra conta com o mesmo e-mail. */
  let userIds = allEmailRows.map((r) => r.id);
  if (preferTid) {
    const inTenantIds = allEmailRows.filter((r) => String(r.tenantId || '') === preferTid).map((r) => r.id);
    if (inTenantIds.length) {
      userIds = inTenantIds;
    } else {
      console.warn(
        `[${label}] Nenhum utilizador no tenant de contexto (${preferTid}) para ${emailRaw}; ` +
          `push dirigido a todas as contas ativas com este e-mail (${userIds.length}).`
      );
    }
  }

  let pushTokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } } });
  if (pushTokens.length === 0 && userIds.length < allEmailRows.length) {
    console.warn(
      `[${label}] Sem token Expo nas contas do tenant preferido; ` +
        `nova tentativa com todos os utilizadores ativos deste e-mail (${allEmailRows.length}).`
    );
    userIds = allEmailRows.map((r) => r.id);
    pushTokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } } });
  }

  if (pushTokens.length === 0) {
    console.warn(`[${label}] Push ignorado: sem token Expo (app com sessão + notificações). email=`, emailRaw);
    return { sent: 0, skipped: 'no_tokens' };
  }

  /** iOS: segunda linha; na tela bloqueada as ações aparecem ao expandir. */
  const subtitle =
    String(opts.pushSubtitle || '').trim() ||
    'Deslize para baixo — Aceitar, Recusar ou OK.';

  const baseData = {
    taskId: executionId,
    type: 'os_dispatched',
    appDisplayName,
    liveActivityBadgeKey,
  };
  const extra = opts.extraData && typeof opts.extraData === 'object' ? opts.extraData : {};
  const pushRes = await sendExpoPushToMany(pushTokens, {
    title: String(opts.pushTitle || `Nova atividade · ${appDisplayName}`).slice(0, 120),
    body: String(opts.pushBody || 'Nova atividade na sua lista.').slice(0, 180),
    subtitle: subtitle.slice(0, 120),
    /** iOS 15+ (Expo): explícito; «time-sensitive» exige capability no App ID. */
    interruptionLevel: 'active',
    categoryId: 'BRSPARK_TECH_ACTIVITY',
    channelId: 'brspark-tecnico',
    data: {
      ...baseData,
      ...extra,
    },
  });
  if (pushRes && pushRes.ok === false) {
    console.error(`[${label}] Expo push falhou:`, pushRes);
  } else {
    console.log(`[${label}] Push Expo: ${pushRes?.sent ?? '?'} ok / ${pushTokens.length} token(s)`);
  }
  return { sent: Number(pushRes?.sent) || 0 };
}

module.exports = {
  sendFieldTaskActivityPushToAssignee,
};
