'use strict';

const prisma = require('../db');
const { extractClientEmailFromMetadata } = require('./technicianClientChatGate');

/**
 * @param {unknown} raw
 * @returns {Date|null}
 */
function parseIsoDate(raw) {
  if (raw == null || raw === '') return null;
  const d = new Date(String(raw));
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Resolve e-mails técnico + cliente final a partir da execução da OS (metadata de despacho).
 * @param {{ metadata?: unknown, ownerEmail?: string|null } | null} execution
 * @param {string} technicianEmail email do User técnico (fallback se owner diferir)
 * @returns {{ techEmail: string, clientEmail: string | null, warnings: string[] }}
 */
function resolveTechAndClientEmails(execution, technicianEmail) {
  const warnings = [];
  const tech = String(technicianEmail || '').trim().toLowerCase();
  if (!tech) {
    return { techEmail: '', clientEmail: null, warnings: ['E-mail do técnico ausente.'] };
  }
  if (!execution) {
    return {
      techEmail: tech,
      clientEmail: null,
      warnings: ['Não há execução (OS) associada à instância de avaliação.'],
    };
  }
  const owner = String(execution.ownerEmail || '').trim().toLowerCase();
  const techEmail = owner && owner.includes('@') ? owner : tech;
  if (owner && owner !== tech) {
    warnings.push('O ownerEmail da OS difere do e-mail do técnico na instância; foi usado o owner da OS como técnico no chat.');
  }
  const clientEmail = extractClientEmailFromMetadata(execution.metadata);
  if (!clientEmail) {
    warnings.push(
      'Não foi encontrado e-mail do cliente na metadata da OS (clientUserEmail, clientEmail, etc.). Não é possível localizar a sala 1:1.',
    );
  }
  return { techEmail, clientEmail, warnings };
}

/**
 * @param {string} techEmail
 * @param {string} clientEmail
 * @returns {Promise<string|null>}
 */
async function findDirectRoomId(techEmail, clientEmail) {
  const a = String(techEmail || '').trim().toLowerCase();
  const b = String(clientEmail || '').trim().toLowerCase();
  if (!a || !b || a === b) return null;
  const room = await prisma.chatRoom.findFirst({
    where: {
      isGroup: false,
      AND: [{ members: { some: { userId: a } } }, { members: { some: { userId: b } } }],
    },
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  return room ? room.id : null;
}

/**
 * Monta transcrição do chat técnico–cliente para auditoria (disputas).
 * @param {string} evaluationInstanceId
 * @returns {Promise<{
 *   evaluationInstanceId: string,
 *   executionId: string | null,
 *   osNumber: string | null,
 *   techEmail: string,
 *   clientEmail: string | null,
 *   roomId: string | null,
 *   windowFrom: string | null,
 *   windowTo: string | null,
 *   warnings: string[],
 *   messages: Array<{ id: string, senderId: string, senderName: string, type: string, content: string | null, mediaUrl: string | null, createdAt: string }>
 * }>}
 */
async function buildChatTranscriptForEvaluationInstance(evaluationInstanceId) {
  const warnings = [];
  const inst = await prisma.evaluationInstance.findUnique({
    where: { id: evaluationInstanceId },
    include: {
      technician: { select: { email: true } },
      execution: {
        select: {
          id: true,
          osNumber: true,
          metadata: true,
          ownerEmail: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          syncedAt: true,
        },
      },
    },
  });
  if (!inst) {
    const err = new Error('Instância de avaliação não encontrada.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const techFromUser = String(inst.technician?.email || '').trim().toLowerCase();
  const { techEmail, clientEmail, warnings: w0 } = resolveTechAndClientEmails(inst.execution, techFromUser);
  warnings.push(...w0);

  let roomId = null;
  if (clientEmail) {
    roomId = await findDirectRoomId(techEmail, clientEmail);
    if (!roomId) {
      warnings.push(`Nenhuma sala de chat 1:1 encontrada entre «${techEmail}» e «${clientEmail}».`);
    }
  }

  const ex = inst.execution;
  let windowFrom = ex?.createdAt || inst.createdAt;
  const meta = ex?.metadata && typeof ex.metadata === 'object' ? ex.metadata : {};
  const trStart = parseIsoDate(meta.trackingStartedAt);
  if (trStart && windowFrom && trStart < windowFrom) {
    windowFrom = trStart;
  }

  let windowTo = ex?.completedAt || ex?.syncedAt || inst.updatedAt || new Date();
  if (!(windowTo instanceof Date) || !Number.isFinite(windowTo.getTime())) {
    windowTo = new Date();
  }

  /** @type {Array<{ id: string, senderId: string, senderName: string, type: string, content: string | null, mediaUrl: string | null, createdAt: string }>} */
  const messages = [];
  if (roomId) {
    const rows = await prisma.chatMessage.findMany({
      where: {
        roomId,
        createdAt: {
          gte: windowFrom,
          lte: windowTo,
        },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        senderId: true,
        senderName: true,
        type: true,
        content: true,
        mediaUrl: true,
        createdAt: true,
      },
    });
    for (const m of rows) {
      messages.push({
        id: m.id,
        senderId: m.senderId,
        senderName: m.senderName,
        type: m.type,
        content: m.content,
        mediaUrl: m.mediaUrl,
        createdAt: m.createdAt.toISOString(),
      });
    }
  }

  return {
    evaluationInstanceId: inst.id,
    executionId: ex?.id || null,
    osNumber: ex?.osNumber || null,
    techEmail,
    clientEmail,
    roomId,
    windowFrom: windowFrom instanceof Date ? windowFrom.toISOString() : null,
    windowTo: windowTo instanceof Date ? windowTo.toISOString() : null,
    warnings,
    messages,
  };
}

module.exports = {
  buildChatTranscriptForEvaluationInstance,
  resolveTechAndClientEmails,
  findDirectRoomId,
};
