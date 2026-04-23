'use strict';

const prisma = require('../db');
const { extractClientEmailFromMetadata } = require('./technicianClientChatGate');
const { sendTransactionalEmailWithFallback } = require('./transactionalEmailSend');

function cloneExecMetadata(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object' && !Array.isArray(p)) return { ...p };
    } catch (_) {
      /* ignore */
    }
    return {};
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  return {};
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * E-mail ao endereço opcional do cliente (metadata do despacho): link público de acompanhamento.
 * Idempotente: grava `clientTrackingLinkEmailSentAt` só após envio bem-sucedido (retries em POST /start repetido).
 *
 * @param {{ executionId: string, trackingUrl: string }} opts
 * @returns {Promise<{ ok: boolean, skipped?: string }>}
 */
async function sendClientTrackingLinkEmail(opts) {
  const executionId = String(opts?.executionId || '').trim();
  const trackingUrl = String(opts?.trackingUrl || '').trim();
  if (!executionId || !trackingUrl) return { ok: false, skipped: 'bad_args' };

  const exec = await prisma.checklistExecution.findUnique({
    where: { id: executionId },
    select: { id: true, etaMinutes: true, metadata: true },
  });
  if (!exec) return { ok: false, skipped: 'not_found' };

  let meta = cloneExecMetadata(exec.metadata);
  if (meta.clientTrackingLinkEmailSentAt) {
    return { ok: true, skipped: 'already_sent' };
  }

  const clientEmail = extractClientEmailFromMetadata(meta);
  if (!clientEmail) {
    return { ok: true, skipped: 'no_client_email' };
  }

  const etaRaw = exec.etaMinutes;
  const eta =
    etaRaw != null && Number.isFinite(Number(etaRaw)) ? Math.max(1, Math.round(Number(etaRaw))) : null;
  const osTitle =
    meta.title != null && String(meta.title).trim() ? String(meta.title).trim() : 'Ordem de serviço';

  const subject = `Acompanhe o deslocamento — ${osTitle.slice(0, 80)}`;
  const etaLine = eta
    ? `Chegada prevista: cerca de ${eta} minutos (estimativa).`
    : 'Pode seguir a posição em tempo real no link abaixo.';

  const text = [
    'O técnico iniciou o deslocamento.',
    '',
    etaLine,
    '',
    'Link para acompanhamento (mapa e chat, quando disponível):',
    trackingUrl,
    '',
    '— BrSpark',
  ].join('\n');

  const safeUrl = escapeHtml(trackingUrl);
  const html = `<p>O técnico iniciou o deslocamento.</p><p>${escapeHtml(etaLine)}</p><p><a href="${safeUrl}">Abrir acompanhamento</a></p><p style="font-size:12px;color:#64748b">Se o botão não funcionar, copie e cole o endereço no navegador:<br/>${safeUrl}</p>`;

  const { send, provider } = await sendTransactionalEmailWithFallback({
    to: clientEmail,
    subject,
    text,
    html,
  });

  if (send && send.ok) {
    meta = { ...meta, clientTrackingLinkEmailSentAt: new Date().toISOString() };
    await prisma.checklistExecution.update({
      where: { id: executionId },
      data: { metadata: meta },
    });
    return { ok: true, provider };
  }

  const reason =
    send && send.skipped
      ? send.reason || send.error || 'skipped'
      : send?.error || 'send_failed';
  return { ok: false, skipped: String(reason || 'send_failed'), provider };
}

module.exports = {
  sendClientTrackingLinkEmail,
};
