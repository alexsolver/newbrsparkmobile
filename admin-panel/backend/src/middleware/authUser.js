'use strict';
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { buildAppAuthorization } = require('../lib/authorization');
const { resolveAppEffectiveTenantId } = require('../lib/appLoginEffectiveTenant');
const { continueWithRlsTransaction } = require('./prismaRlsRequestContext');

// Middleware para usuários do app (não admin)
module.exports = async function authUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    /**
     * JWT do painel (tenant-login / impersonação): utilizador real da org, sem `sessionId` no token.
     * Mesmas rotas que o app (chat, storage) com `req.user` alinhado ao utilizador em base de dados.
     */
    if (payload.panel === true && payload.userId && payload.tenantId) {
      const user = await prisma.user.findUnique({
        where: { id: String(payload.userId).trim() },
        select: {
          id: true,
          email: true,
          name: true,
          tenantId: true,
          role: true,
          isActive: true,
          currentSessionId: true,
        },
      });
      if (!user || !user.isActive) {
        return res.status(403).json({ error: 'Conta desativada.', code: 'ACCOUNT_INACTIVE' });
      }
      if (String(user.tenantId) !== String(payload.tenantId)) {
        return res.status(403).json({ error: 'Token inválido para este utilizador.' });
      }
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        role: user.role,
        sessionId: user.currentSessionId,
        panel: true,
      };
      req.userAuthorization = buildAppAuthorization(req.user);
      return await continueWithRlsTransaction(req, res, next);
    }

    // Admin legado: sem tenantId. Utilizador do app (incl. cliente B2C) tem sempre `id` e `sessionId` no token.
    if (!payload.tenantId && !payload.id) {
      return res.status(403).json({ error: 'Token de admin não pode acessar rotas de usuário.' });
    }

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

    const effectiveTenantId = await resolveAppEffectiveTenantId(prisma, payload.id);
    const tenantIdForReq =
      effectiveTenantId && String(effectiveTenantId).trim()
        ? String(effectiveTenantId).trim()
        : user.tenantId;

    // tenantId do contexto app: dedicado ativo → tenant da empresa; caso contrário, linha User (o JWT pode ficar desatualizado).
    req.user = { ...payload, tenantId: tenantIdForReq, role: user.role };
    req.userAuthorization = buildAppAuthorization(req.user);
    return await continueWithRlsTransaction(req, res, next);
  } catch(err) {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
};
