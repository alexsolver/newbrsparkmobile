'use strict';
const jwt = require('jsonwebtoken');

// Middleware para usuários do app (não admin)
module.exports = function authUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // payload.tenantId distingue do admin (que não tem tenantId)
    if (!payload.tenantId) return res.status(403).json({ error: 'Token de admin não pode acessar rotas de usuário.' });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
};
