'use strict';

const prisma = require('../db');
const { sendExpoPushToMany } = require('../services/expoPush');
const { extractClientEmailFromMetadata } = require('./technicianClientChatGate');

const PUSH_CATEGORY_CLIENT = 'BRSPARK_CLIENT_TRACKING';
const ANDROID_CLIENT_CHANNEL = 'brspark-cliente';

async function resolveUserIdsForClientPush(clientEmail, tenantId) {
  const raw = String(clientEmail || '').trim();
  if (!raw) return [];
  const emailFilter = { equals: raw, mode: 'insensitive' };

  if (tenantId) {
    const u = await prisma.user.findFirst({
      where: { isActive: true, tenantId, email: emailFilter },
      select: { id: true },
    });
    return u ? [u.id] : [];
  }
  const users = await prisma.user.findMany({
    where: { isActive: true, email: emailFilter },
    select: { id: true },
  });
  return users.map((x) => x.id);
}

/**
 * Push ao cliente final: prestador a caminho + botão para abrir o link público de rastreio.
 * @param {{ executionId: string, trackingUrl: string }} opts
 * @returns {Promise<{ ok: boolean, skipped?: string }>}
 */
async function sendClientProviderEnRoutePush(opts) {
  const executionId = String(opts?.executionId || '').trim();
  const trackingUrl = String(opts?.trackingUrl || '').trim();
  if (!executionId || !trackingUrl) return { ok: false, skipped: 'bad_args' };

  const exec = await prisma.checklistExecution.findUnique({
    where: { id: executionId },
    include: { template: { select: { tenantId: true } } },
  });
  if (!exec) return { ok: false, skipped: 'not_found' };

  let meta =
    typeof exec.metadata === 'object' && exec.metadata && !Array.isArray(exec.metadata)
      ? { ...exec.metadata }
      : {};
  if (meta.clientEnRoutePushSentAt || meta.clientEnRoutePushSkippedNoEmail) {
    return { ok: true, skipped: 'already_sent_or_skipped' };
  }

  const clientEmail = extractClientEmailFromMetadata(meta);
  if (!clientEmail) {
    await prisma.checklistExecution.update({
      where: { id: executionId },
      data: {
        metadata: { ...meta, clientEnRoutePushSkippedNoEmail: true },
      },
    });
    return { ok: true, skipped: 'no_client_email' };
  }

  const tenantId = exec.template?.tenantId || null;
  const userIds = await resolveUserIdsForClientPush(clientEmail, tenantId);
  if (userIds.length === 0) {
    return { ok: true, skipped: 'no_user' };
  }

  const pushTokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } } });
  if (pushTokens.length === 0) {
    return { ok: true, skipped: 'no_tokens' };
  }

  const etaRaw = exec.etaMinutes;
  const eta =
    etaRaw != null && Number.isFinite(Number(etaRaw)) ? Math.max(1, Math.round(Number(etaRaw))) : null;

  const title = 'Prestador a caminho';
  const main = eta
    ? `Chegada prevista em cerca de ${eta} min. Toque para acompanhar o percurso.`
    : 'O prestador iniciou o deslocamento. Toque para acompanhar o percurso.';
  const body = `${main}\n\nDeslize para expandir e toque em «Acompanhar percurso».`.slice(0, 240);

  const pushRes = await sendExpoPushToMany(pushTokens, {
    title,
    body,
    categoryId: PUSH_CATEGORY_CLIENT,
    channelId: ANDROID_CLIENT_CHANNEL,
    data: {
      type: 'client_provider_en_route',
      executionId,
      trackingUrl,
      etaMinutes: eta != null ? String(eta) : '',
    },
  });

  if (pushRes && Number(pushRes.sent) > 0) {
    meta = { ...meta, clientEnRoutePushSentAt: new Date().toISOString() };
    await prisma.checklistExecution.update({
      where: { id: executionId },
      data: { metadata: meta },
    });
  }

  return { ok: true };
}

module.exports = {
  sendClientProviderEnRoutePush,
  PUSH_CATEGORY_CLIENT,
  ANDROID_CLIENT_CHANNEL,
};
