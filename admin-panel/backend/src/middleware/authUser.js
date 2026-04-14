'use strict';
const jwt = require('jsonwebtoken');
const prisma = require('../db');

// Middleware para usuários do app (não admin)
module.exports = async function authUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // payload.tenantId distingue do admin (que não tem tenantId)
    if (!payload.tenantId) return res.status(403).json({ error: 'Token de admin não pode acessar rotas de usuário.' });

    if (!payload.sessionId) {
      return res.status(401).json({
        error: 'Sessão inválida. Faça login novamente.',
        code: 'SESSION_INVALIDATED',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { currentSessionId: true, tenantId: true, role: true, isActive: true },
    });
    if (!user || user.currentSessionId !== payload.sessionId) {
      return res.status(401).json({
        error: 'Sessão inválida ou expirada em outro dispositivo.',
        code: 'SESSION_INVALIDATED',
      });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'Conta desativada.', code: 'ACCOUNT_INACTIVE' });
    }

    // tenantId/role vêm sempre da BD — o JWT pode ficar desatualizado (ex.: usuário mudou de tenant sem novo login).
    req.user = { ...payload, tenantId: user.tenantId, role: user.role };
    next();
  } catch(err) {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
};
