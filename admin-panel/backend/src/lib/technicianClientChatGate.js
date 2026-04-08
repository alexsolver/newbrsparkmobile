'use strict';

const prisma = require('../db');

/** Campos comuns em metadata de despacho / integrações — email do cliente final. */
const META_CLIENT_EMAIL_KEYS = [
  'clientUserEmail',
  'requesterEmail',
  'customerEmail',
  'clientEmail',
  'contactEmail',
  'portalUserEmail',
  'solicitanteEmail',
];

const ACTIVITY_CHAT_STATUSES = ['IN_PROGRESS', 'PAUSED', 'COMPLETED'];

function normalizeExecutionMetadata(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  return {};
}

function extractClientEmailFromMetadata(meta) {
  const m = normalizeExecutionMetadata(meta);
  for (const k of META_CLIENT_EMAIL_KEYS) {
    const v = m[k];
    if (v == null) continue;
    const s = String(v).trim().toLowerCase();
    if (s.includes('@')) return s;
  }
  return null;
}

/**
 * Sala 1:1 com exatamente um utilizador com TechnicianProfile e outro sem.
 * @returns {{ techEmail: string, clientEmail: string } | null}
 */
async function resolveTechnicianClientPair(roomId) {
  const room = await prisma.chatRoom.findUnique({
    where: { id: roomId },
    include: { members: true },
  });
  if (!room || room.isGroup || room.members.length !== 2) return null;

  const emails = room.members.map((m) => String(m.userId || '').trim().toLowerCase()).filter(Boolean);
  if (emails.length !== 2) return null;

  const users = await prisma.user.findMany({
    where: {
      OR: emails.map((e) => ({ email: { equals: e, mode: 'insensitive' } })),
    },
    include: { technicianProfile: true },
  });
  if (users.length !== 2) return null;

  const withTech = users.filter((u) => u.technicianProfile != null);
  const withoutTech = users.filter((u) => u.technicianProfile == null);
  if (withTech.length !== 1 || withoutTech.length !== 1) return null;

  return {
    techEmail: String(withTech[0].email).trim().toLowerCase(),
    clientEmail: String(withoutTech[0].email).trim().toLowerCase(),
  };
}

/**
 * Chat técnico–cliente ativo só com OS do técnico em andamento ou em conclusão (ainda não SYNCED).
 * Vínculo ao cliente: metadata com email do cliente, ou uma única OS ativa sem email em metadata (legado).
 */
async function isTechnicianClientMessagingActive(techEmail, clientEmail) {
  const tech = String(techEmail || '').trim().toLowerCase();
  const client = String(clientEmail || '').trim().toLowerCase();
  if (!tech || !client) return false;

  const rows = await prisma.checklistExecution.findMany({
    where: {
      ownerEmail: { equals: tech, mode: 'insensitive' },
      status: { in: ACTIVITY_CHAT_STATUSES },
    },
    select: { id: true, metadata: true },
  });

  if (rows.length === 0) return false;

  for (const row of rows) {
    const spec = extractClientEmailFromMetadata(row.metadata);
    if (spec && spec === client) return true;
  }

  const hasExplicitOtherClient = rows.some((row) => {
    const spec = extractClientEmailFromMetadata(row.metadata);
    return spec != null && spec !== client;
  });
  if (hasExplicitOtherClient) return false;

  const allUnspecified = rows.every((row) => extractClientEmailFromMetadata(row.metadata) == null);
  if (allUnspecified && rows.length === 1) return true;

  return false;
}

/**
 * @returns {Promise<{ technicianClientGated: boolean, messagingActive: boolean }>}
 */
async function getRoomMessagingState(roomId) {
  const pair = await resolveTechnicianClientPair(roomId);
  if (!pair) {
    return { technicianClientGated: false, messagingActive: true };
  }
  const active = await isTechnicianClientMessagingActive(pair.techEmail, pair.clientEmail);
  return { technicianClientGated: true, messagingActive: active };
}

module.exports = {
  resolveTechnicianClientPair,
  isTechnicianClientMessagingActive,
  getRoomMessagingState,
  extractClientEmailFromMetadata,
  ACTIVITY_CHAT_STATUSES,
};
