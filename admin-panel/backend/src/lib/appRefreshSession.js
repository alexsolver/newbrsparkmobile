'use strict';

const crypto = require('crypto');
const { resolveCanonicalEmailNormForUser } = require('./userEmailUnique');

function hashRefreshToken(plain) {
  return crypto.createHash('sha256').update(String(plain || ''), 'utf8').digest('hex');
}

function generateOpaqueRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

/**
 * Converte `expiresIn` estilo JWT (`15m`, `24h`, `90d`) em milissegundos (aprox. dias = 86400000).
 * @param {string} [raw]
 * @param {number} fallbackMs
 */
function expiresInToMs(raw, fallbackMs) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return fallbackMs;
  const m = s.match(/^(\d+)\s*([smhd])$/);
  if (!m) return fallbackMs;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;
  const u = m[2];
  if (u === 's') return n * 1000;
  if (u === 'm') return n * 60 * 1000;
  if (u === 'h') return n * 60 * 60 * 1000;
  if (u === 'd') return n * 24 * 60 * 60 * 1000;
  return fallbackMs;
}

function accessJwtExpiresIn(env) {
  return (
    String(env.JWT_ACCESS_EXPIRES_IN || '').trim() ||
    String(env.JWT_EXPIRES_IN || '').trim() ||
    '24h'
  );
}

function refreshTtlMs(env) {
  const fromEnv = String(env.JWT_REFRESH_EXPIRES_IN || '').trim();
  return expiresInToMs(fromEnv, 90 * 24 * 60 * 60 * 1000);
}

/**
 * Remove linhas de refresh de outras sessões do mesmo utilizador; insere nova linha.
 * @returns {Promise<string>} token opaco (mostrar uma vez ao cliente)
 */
async function replaceUserRefreshSession(prisma, { userId, sessionId, deviceId }) {
  await prisma.appRefreshSession.deleteMany({
    where: { userId, sessionId: { not: String(sessionId) } },
  });
  const plain = generateOpaqueRefreshToken();
  const tokenHash = hashRefreshToken(plain);
  const expiresAt = new Date(Date.now() + refreshTtlMs(process.env));
  const dev = deviceId != null && String(deviceId).trim() ? String(deviceId).trim().slice(0, 255) : null;
  await prisma.appRefreshSession.create({
    data: {
      userId,
      sessionId: String(sessionId),
      tokenHash,
      expiresAt,
      ...(dev ? { deviceId: dev } : {}),
    },
  });
  return plain;
}

/**
 * Troca refresh válido por novo par (access JWT + refresh opaco). Rotação do refresh.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {typeof import('jsonwebtoken')} jwt
 * @param {string} refreshTokenPlain
 * @param {Record<string, string | undefined>} env
 */
async function refreshAppSession(prisma, jwt, refreshTokenPlain, env) {
  const hash = hashRefreshToken(refreshTokenPlain);
  const row = await prisma.appRefreshSession.findUnique({
    where: { tokenHash: hash },
  });
  const now = new Date();
  if (!row || row.revokedAt || row.expiresAt.getTime() <= now.getTime()) {
    return { ok: false };
  }

  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    include: {
      tenant: true,
      technicianProfile: true,
      appAccount: { select: { emailNorm: true } },
    },
  });
  if (!user || !user.isActive || !user.tenant) {
    return { ok: false };
  }
  if (user.tenant.status === 'SUSPENDED' || user.tenant.status === 'CANCELLED') {
    return { ok: false };
  }
  if (String(user.currentSessionId || '') !== String(row.sessionId || '')) {
    return { ok: false };
  }

  const newPlain = generateOpaqueRefreshToken();
  const newHash = hashRefreshToken(newPlain);
  const newExpiresAt = new Date(Date.now() + refreshTtlMs(env));

  await prisma.$transaction([
    prisma.appRefreshSession.update({
      where: { id: row.id },
      data: { revokedAt: now, lastUsedAt: now },
    }),
    prisma.appRefreshSession.create({
      data: {
        userId: user.id,
        sessionId: String(row.sessionId),
        tokenHash: newHash,
        expiresAt: newExpiresAt,
        ...(row.deviceId ? { deviceId: row.deviceId } : {}),
      },
    }),
  ]);

  const secret = String(env.JWT_SECRET || '').trim();
  if (!secret) {
    return { ok: false };
  }

  const jwtEmail = await resolveCanonicalEmailNormForUser(prisma, user);
  const token = jwt.sign(
    {
      id: user.id,
      tenantId: user.tenantId,
      email: jwtEmail,
      role: user.role,
      sessionId: row.sessionId,
    },
    secret,
    { expiresIn: accessJwtExpiresIn(env) },
  );

  return { ok: true, token, refreshToken: newPlain };
}

module.exports = {
  hashRefreshToken,
  replaceUserRefreshSession,
  refreshAppSession,
  accessJwtExpiresIn,
  refreshTtlMs,
};
