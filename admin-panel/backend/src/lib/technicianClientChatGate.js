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
  /** Variantes usadas por integrações / UI em PT */
  'userEmail',
  'usuarioEmail',
  'emailCliente',
  'emailDoCliente',
];

const ACTIVITY_CHAT_STATUSES = ['IN_PROGRESS', 'PAUSED', 'COMPLETED'];

/** Só salas técnico (com perfil) ↔ cliente final (`USER` sem perfil) aplicam o gate. */
const CLIENT_USER_ROLE = 'USER';

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

function looksLikeUsableClientEmailValue(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s.length > 3 && s.includes('@');
}

function extractClientEmailFromMetadata(meta) {
  const m = normalizeExecutionMetadata(meta);
  for (const k of META_CLIENT_EMAIL_KEYS) {
    const v = m[k];
    if (!looksLikeUsableClientEmailValue(v)) continue;
    return String(v).trim().toLowerCase();
  }
  return null;
}

/**
 * Impede que sync do app substitua e-mail de contacto do despacho por vazio/null ou valor sem @.
 * @param {object|string|null|undefined} serverMeta — metadata já na base antes do merge
 * @param {object} merged — tipicamente `{ ...existente, ...incoming }`
 */
function preserveDispatchClientContactMetadata(serverMeta, merged) {
  const base = normalizeExecutionMetadata(serverMeta);
  const out = merged && typeof merged === 'object' && !Array.isArray(merged) ? { ...merged } : {};
  for (const k of META_CLIENT_EMAIL_KEYS) {
    const prev = base[k];
    if (!looksLikeUsableClientEmailValue(prev)) continue;
    if (!looksLikeUsableClientEmailValue(out[k])) {
      out[k] = prev;
    }
  }
  return out;
}

/**
 * Deslocamento iniciado: token de tracking no metadata OU evidência `action: SAIDA` nas respostas.
 */
function hasDisplacementStarted(metadata, responses) {
  const m = normalizeExecutionMetadata(metadata);
  if (m.trackingStartedAt != null && String(m.trackingStartedAt).trim() !== '') {
    return true;
  }
  return responsesHaveTransitSaida(responses);
}

/**
 * Procura em profundidade JSON de respostas por objeto de início de deslocamento (compatível com o app).
 */
function responsesHaveTransitSaida(responses) {
  if (responses == null) return false;
  let root = responses;
  if (typeof root === 'string') {
    try {
      root = JSON.parse(root);
    } catch {
      return false;
    }
  }
  if (!root || typeof root !== 'object') return false;
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (cur == null) continue;
    if (typeof cur === 'string') {
      const t = cur.trim();
      if (t.length > 2 && (t.startsWith('{') || t.startsWith('['))) {
        try {
          stack.push(JSON.parse(t));
        } catch {
          /* ignore */
        }
      }
      continue;
    }
    if (typeof cur !== 'object') continue;
    if (Array.isArray(cur)) {
      for (const x of cur) stack.push(x);
      continue;
    }
    if (cur.action === 'SAIDA' && cur.timestamp && cur.coordinates) {
      return true;
    }
    for (const k of Object.keys(cur)) {
      if (k.startsWith('__')) continue;
      stack.push(cur[k]);
    }
  }
  return false;
}

/**
 * Sala 1:1 com exatamente um usuário com TechnicianProfile e outro sem, sendo o sem perfil
 * um cliente final (`USER`). Gestores e staff interno não entram no gate.
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

  const nonTechUser = withoutTech[0];
  if (String(nonTechUser.role || '').toUpperCase() !== CLIENT_USER_ROLE) {
    return null;
  }

  return {
    techEmail: String(withTech[0].email).trim().toLowerCase(),
    clientEmail: String(nonTechUser.email).trim().toLowerCase(),
  };
}

/** OS com metadata explícita apontando para este cliente + deslocamento iniciado. */
function rowExplicitlyLinksClient(row, client) {
  if (!hasDisplacementStarted(row.metadata, row.responses)) return false;
  const spec = extractClientEmailFromMetadata(row.metadata);
  return !!(spec && spec === client);
}

/** Uma única OS ativa sem email na metadata: o cliente do chat é o implícito (legado). */
function rowImplicitLegacySingleClient(row) {
  if (!hasDisplacementStarted(row.metadata, row.responses)) return false;
  return extractClientEmailFromMetadata(row.metadata) == null;
}

/**
 * Chat técnico–cliente ativo só com OS do técnico em andamento ou em conclusão (ainda não SYNCED)
 * e **após início do deslocamento** (tracking ou evidência SAIDA nas respostas).
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
    select: { id: true, metadata: true, responses: true },
  });

  if (rows.length === 0) return false;

  for (const row of rows) {
    if (rowExplicitlyLinksClient(row, client)) return true;
  }

  const hasExplicitOtherClient = rows.some((row) => {
    const spec = extractClientEmailFromMetadata(row.metadata);
    return spec != null && spec !== client;
  });
  if (hasExplicitOtherClient) return false;

  const allUnspecified = rows.every((row) => extractClientEmailFromMetadata(row.metadata) == null);
  if (allUnspecified && rows.length === 1) {
    return rowImplicitLegacySingleClient(rows[0]);
  }

  return false;
}

/**
 * Avaliação já respondida (ou finalizada com pontuação) numa OS que liga técnico↔cliente
 * bloqueia chat mesmo que a OS ainda esteja COMPLETED (antes de SYNCED).
 */
async function evaluationBlocksTechClientChat(techEmail, clientEmail) {
  const tech = String(techEmail || '').trim().toLowerCase();
  const client = String(clientEmail || '').trim().toLowerCase();
  if (!tech || !client) return false;

  const rows = await prisma.checklistExecution.findMany({
    where: {
      ownerEmail: { equals: tech, mode: 'insensitive' },
      status: { in: ACTIVITY_CHAT_STATUSES },
    },
    select: { id: true, metadata: true, responses: true },
  });

  const linkedIds = [];
  for (const row of rows) {
    if (rowExplicitlyLinksClient(row, client)) linkedIds.push(row.id);
  }

  const hasExplicitOther = rows.some((row) => {
    const spec = extractClientEmailFromMetadata(row.metadata);
    return spec != null && spec !== client;
  });
  if (!hasExplicitOther && rows.length === 1 && linkedIds.length === 0) {
    if (rowImplicitLegacySingleClient(rows[0])) {
      linkedIds.push(rows[0].id);
    }
  }

  if (linkedIds.length === 0) return false;

  const blocker = await prisma.evaluationInstance.findFirst({
    where: {
      executionId: { in: linkedIds },
      OR: [
        { status: { in: ['RESPONDED', 'IN_REVIEW'] } },
        { status: 'FINALIZED', score: { isNot: null } },
      ],
    },
    select: { id: true },
  });

  return !!blocker;
}

/**
 * @returns {Promise<{ technicianClientGated: boolean, messagingActive: boolean }>}
 */
async function getRoomMessagingState(roomId) {
  const pair = await resolveTechnicianClientPair(roomId);
  if (!pair) {
    return { technicianClientGated: false, messagingActive: true };
  }
  let active = await isTechnicianClientMessagingActive(pair.techEmail, pair.clientEmail);
  if (active && (await evaluationBlocksTechClientChat(pair.techEmail, pair.clientEmail))) {
    active = false;
  }
  return { technicianClientGated: true, messagingActive: active };
}

module.exports = {
  resolveTechnicianClientPair,
  isTechnicianClientMessagingActive,
  evaluationBlocksTechClientChat,
  getRoomMessagingState,
  extractClientEmailFromMetadata,
  preserveDispatchClientContactMetadata,
  hasDisplacementStarted,
  ACTIVITY_CHAT_STATUSES,
};
