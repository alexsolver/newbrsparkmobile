'use strict';

const { sendExpoPushToMany } = require('../services/expoPush');
const { resolveActiveUserIdsForDispatchOwnerEmail } = require('./userEmailUnique');

/** Canal Android alinhado a `ANDROID_CHANNEL_TRACKING_CLIENT_CHAT` no app (notifications.ts). */
const CHANNEL_TRACKING_CLIENT_CHAT = 'brspark-tracking-client-chat';

const LOG_LABEL = 'trackingClientChatPush';

/**
 * Resolve utilizador(es) do técnico pelo e-mail dono da OS (mesma lógica que fieldTaskAssigneePush).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ ownerEmail: string, templateTenantId?: string|null }} opts
 * @returns {Promise<string[]>} user ids
 */
async function resolveTechnicianUserIds(prisma, opts) {
  const emailRaw = String(opts.ownerEmail || '').trim();
  const templateTid = opts.templateTenantId || null;
  if (!emailRaw) return [];
  const userIds = await resolveActiveUserIdsForDispatchOwnerEmail(prisma, emailRaw, { tenantId: templateTid });
  if (templateTid && userIds.length > 0) {
    const inTenant = await prisma.user.count({ where: { id: { in: userIds }, tenantId: templateTid } });
    if (inTenant === 0) {
      console.warn(
        `[${LOG_LABEL}] Fallback por AppAccount/e-mail (fora do tenant do template): ${emailRaw}`
      );
    }
  }
  return userIds;
}

/**
 * Push ao técnico quando o cliente envia mensagem no chat do link de rastreio.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ executionId: string, ownerEmail: string, templateTenantId?: string|null, messagePreview: string }} opts
 * @returns {Promise<{ sent: number, skipped?: string }>}
 */
async function sendTrackingClientChatPushToTechnician(prisma, opts) {
  const executionId = String(opts?.executionId || '').trim();
  const ownerEmail = String(opts?.ownerEmail || '').trim();
  const preview = String(opts?.messagePreview || '').trim().slice(0, 140);
  if (!executionId || !ownerEmail) {
    return { sent: 0, skipped: 'bad_args' };
  }

  const userIds = await resolveTechnicianUserIds(prisma, {
    ownerEmail,
    templateTenantId: opts.templateTenantId || null,
  });
  if (userIds.length === 0) {
    console.warn(`[${LOG_LABEL}] Sem utilizador ativo para`, ownerEmail);
    return { sent: 0, skipped: 'no_user' };
  }

  const pushTokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } } });
  if (pushTokens.length === 0) {
    console.warn(`[${LOG_LABEL}] Sem token Expo para técnico`, ownerEmail);
    return { sent: 0, skipped: 'no_tokens' };
  }

  /**
   * Push com som: em iOS, `interruptionLevel: passive` não reproduz som (só entra na lista).
   * `active` permite som + apresentação normal; no app em 1.º plano, `notifications.ts` pode
   * suprimir banner e manter som; o mapa usa aura no ícone de chat.
   * Título/corpo visíveis: antes usavam um espaço único e o sistema mostrava notificação em branco.
   */
  const title = 'Mensagem do cliente';
  const body =
    preview.length > 0
      ? preview.slice(0, 200)
      : 'Cliente enviou uma mensagem no chat de acompanhamento.';
  const pushRes = await sendExpoPushToMany(pushTokens, {
    title,
    body,
    priority: 'high',
    android: {
      channelId: CHANNEL_TRACKING_CLIENT_CHAT,
      sound: 'default',
    },
    data: {
      type: 'tracking_client_chat',
      taskId: executionId,
      executionId,
      messagePreview: preview.slice(0, 200),
    },
  });

  if (pushRes && pushRes.ok === false) {
    console.error(`[${LOG_LABEL}] Expo falhou:`, pushRes);
  } else {
    console.log(`[${LOG_LABEL}] ${pushRes?.sent ?? '?'} enviado(s) / ${pushTokens.length} token(s)`);
  }
  return { sent: Number(pushRes?.sent) || 0 };
}

module.exports = {
  sendTrackingClientChatPushToTechnician,
};
