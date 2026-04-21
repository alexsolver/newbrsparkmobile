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

  let userIds = [];
  if (assigneeTid) {
    const u = await prisma.user.findFirst({
      where: { isActive: true, tenantId: assigneeTid, email: emailFilter },
      select: { id: true, email: true },
    });
    if (u) userIds = [u.id];
  } else if (templateTid) {
    const u = await prisma.user.findFirst({
      where: { isActive: true, tenantId: templateTid, email: emailFilter },
      select: { id: true, email: true, tenantId: true },
    });
    if (u) {
      userIds = [u.id];
    } else {
      /**
       * O despacho usa `template.tenantId`, mas o técnico pode estar noutro tenant (prestador filiado,
       * migração, etc.). Sem fallback o push ia a zero utilizadores → sem faixa no iPhone.
       */
      const fb = await prisma.user.findFirst({
        where: { isActive: true, email: emailFilter },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, tenantId: true },
      });
      if (fb) {
        userIds = [fb.id];
        console.warn(
          `[${label}] Nenhum utilizador no tenant do template (${templateTid}) para ${emailRaw}; ` +
            `push com utilizador tenantId=${fb.tenantId} (fallback por e-mail).`
        );
      }
    }
  } else {
    const users = await prisma.user.findMany({
      where: { isActive: true, email: emailFilter },
      select: { id: true, email: true },
    });
    userIds = users.map((x) => x.id);
    if (users.length > 1) {
      console.warn(`[${label}] Vários usuários ativos com o mesmo e-mail:`, emailRaw);
    }
  }

  if (userIds.length === 0) {
    console.warn(`[${label}] Push ignorado: nenhum usuário ativo:`, emailRaw);
    return { sent: 0, skipped: 'no_user' };
  }

  const pushTokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } } });
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
