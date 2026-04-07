'use strict';
const jwt = require('jsonwebtoken');

function adminAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação ausente.' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

/**
 * Admin JWT OU Bearer igual a REPORTS_API_KEY (integrações externas).
 */
function adminOrReportsApiKey(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação ausente.' });
  }
  const token = header.slice(7).trim();
  const reportsKey = process.env.REPORTS_API_KEY && String(process.env.REPORTS_API_KEY).trim();
  if (reportsKey && token === reportsKey) {
    req.reportsApiKeyAuth = true;
    return next();
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

module.exports = { adminAuth, adminOrReportsApiKey };
