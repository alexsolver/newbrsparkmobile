'use strict';

const jwt = require('jsonwebtoken');
const prisma = require('../db');

/**
 * Preenche req.appUser se houver Bearer válido (sessão app); não responde 401.
 */
module.exports = async function optionalAuthUser(req, res, next) {
  req.appUser = null;
  const header = req.headers.authorization || '';
  const raw = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!raw) return next();
  try {
    const payload = jwt.verify(raw, process.env.JWT_SECRET);
    if (!payload.tenantId || !payload.sessionId) return next();
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        email: true,
        tenantId: true,
        role: true,
        isActive: true,
        currentSessionId: true,
      },
    });
    if (user?.isActive && user.currentSessionId === payload.sessionId) {
      req.appUser = user;
    }
  } catch {
    /* token inválido — tratar como anónimo */
  }
  next();
};
