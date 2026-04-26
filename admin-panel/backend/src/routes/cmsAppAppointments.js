'use strict';

/**
 * Proxy app móvel → BrsparkWeb: listagem de atendimentos do cliente (Laravel)
 * (GET /api/internal/app/my-appointments). Não requer X-Tenant.
 * Cancel: reutilize POST /api/cms/availability/cancel (cmsAppAvailability).
 */
const express = require('express');
const authUser = require('../middleware/authUser');

const router = express.Router();
router.use(authUser);

function cmsBase() {
  return String(process.env.CMS_DIRECTORY_BASE_URL || '').replace(/\/+$/, '');
}

function internalToken() {
  return String(
    process.env.CMS_INTERNAL_API_TOKEN || process.env.BRSPARK_INTERNAL_API_TOKEN || '',
  ).trim();
}

/** Cabeçalhos internos + identificação do utilizador no CMS (sem X-Tenant). */
function forwardAppUserOnlyHeaders(req) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${internalToken()}`,
    'X-Node-User-Id': String(req.user.id),
    'X-Node-User-Email': String(req.user.email || '').trim(),
  };
}

function requireTenant(req) {
  return String(req.header('X-Tenant') || req.query.tenant_id || '').trim();
}

function forwardHeadersWithTenant(req) {
  const xTenant = requireTenant(req);
  if (!xTenant) {
    return null;
  }
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${internalToken()}`,
    'X-Node-User-Id': String(req.user.id),
    'X-Node-User-Email': String(req.user.email || '').trim(),
    'X-Tenant': xTenant,
  };
}

router.get('/my-appointments', async (req, res) => {
  const base = cmsBase();
  const token = internalToken();
  if (!base || !token) {
    return res.status(503).json({
      error: 'Diretório CMS não configurado (CMS_DIRECTORY_BASE_URL / CMS_INTERNAL_API_TOKEN).',
    });
  }
  const headers = forwardAppUserOnlyHeaders(req);
  const qs = new URLSearchParams(req.query);
  const url = `${base}/api/internal/app/my-appointments?${qs.toString()}`;
  try {
    const r = await fetch(url, { method: 'GET', headers });
    const text = await r.text();
    res.status(r.status).type('application/json').send(text);
  } catch (e) {
    res.status(502).json({ error: 'Falha ao contactar o CMS.', message: e.message || String(e) });
  }
});

/** POST reagendamento (requer X-Tenant = empresa do atendimento). */
router.post('/appointments/:id/reschedule', async (req, res) => {
  const base = cmsBase();
  const token = internalToken();
  if (!base || !token) {
    return res.status(503).json({
      error: 'Diretório CMS não configurado (CMS_DIRECTORY_BASE_URL / CMS_INTERNAL_API_TOKEN).',
    });
  }
  const headers = forwardHeadersWithTenant(req);
  if (!headers) {
    return res
      .status(400)
      .json({ error: 'Cabeçalho X-Tenant (ou query tenant_id) é obrigatório.' });
  }
  const id = encodeURIComponent(String(req.params.id));
  const url = `${base}/api/internal/app/appointments/${id}/reschedule`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body || {}),
    });
    const text = await r.text();
    res.status(r.status).type('application/json').send(text);
  } catch (e) {
    res.status(502).json({ error: 'Falha ao contactar o CMS.', message: e.message || String(e) });
  }
});

module.exports = router;
