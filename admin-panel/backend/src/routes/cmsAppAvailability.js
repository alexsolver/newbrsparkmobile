'use strict';

/**
 * Proxy do app móvel → BrsparkWeb (Laravel): slots, hold e confirmação com capacity.
 * Autenticação: JWT de utilizador (authUser). O Node reencaminha com CMS_INTERNAL_API_TOKEN
 * e cabeçalhos X-Node-User-Id + X-Tenant.
 */
const express = require('express');
const multer = require('multer');
const authUser = require('../middleware/authUser');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

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

function requireTenant(req) {
  return String(req.header('X-Tenant') || req.query.tenant_id || '')
    .trim();
}

function forwardHeaders(req) {
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

/** Sem Content-Type: multipart define boundary. */
function forwardHeadersMultipart(req) {
  const xTenant = requireTenant(req);
  if (!xTenant) {
    return null;
  }
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${internalToken()}`,
    'X-Node-User-Id': String(req.user.id),
    'X-Node-User-Email': String(req.user.email || '').trim(),
    'X-Tenant': xTenant,
  };
}

router.get('/availability/slots', async (req, res) => {
  const base = cmsBase();
  const token = internalToken();
  if (!base || !token) {
    return res.status(503).json({
      error: 'Diretório CMS não configurado (CMS_DIRECTORY_BASE_URL / CMS_INTERNAL_API_TOKEN).',
    });
  }
  const headers = forwardHeaders(req);
  if (!headers) {
    return res
      .status(400)
      .json({ error: 'Cabeçalho X-Tenant (ou query tenant_id) é obrigatório.' });
  }
  const qs = new URLSearchParams(req.query);
  const url = `${base}/api/internal/app/availability/slots?${qs.toString()}`;
  try {
    const r = await fetch(url, { method: 'GET', headers });
    const text = await r.text();
    res.status(r.status).type('application/json').send(text);
  } catch (e) {
    res.status(502).json({ error: 'Falha ao contactar o CMS.', message: e.message || String(e) });
  }
});

async function postJson(path, req, res) {
  const base = cmsBase();
  const token = internalToken();
  if (!base || !token) {
    return res.status(503).json({
      error: 'Diretório CMS não configurado (CMS_DIRECTORY_BASE_URL / CMS_INTERNAL_API_TOKEN).',
    });
  }
  const headers = forwardHeaders(req);
  if (!headers) {
    return res
      .status(400)
      .json({ error: 'Cabeçalho X-Tenant (ou query tenant_id) é obrigatório.' });
  }
  const url = `${base}/api/internal/app/availability${path}`;
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
}

router.post('/availability/hold', (req, res) => {
  void postJson('/availability/hold', req, res);
});

router.post('/availability/confirm', (req, res) => {
  void postJson('/availability/confirm', req, res);
});

router.post('/availability/cancel', (req, res) => {
  void postJson('/availability/cancel', req, res);
});

router.post('/availability/upload-booking-media', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file || !file.buffer) {
    return res.status(400).json({ error: 'Envie um ficheiro no campo "file".' });
  }
  const base = cmsBase();
  const token = internalToken();
  if (!base || !token) {
    return res.status(503).json({
      error: 'Diretório CMS não configurado (CMS_DIRECTORY_BASE_URL / CMS_INTERNAL_API_TOKEN).',
    });
  }
  const headers = forwardHeadersMultipart(req);
  if (!headers) {
    return res
      .status(400)
      .json({ error: 'Cabeçalho X-Tenant (ou query tenant_id) é obrigatório.' });
  }
  const url = `${base}/api/internal/app/availability/upload-booking-media`;
  const form = new FormData();
  const blob = new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' });
  form.append('file', blob, file.originalname || 'upload.jpg');
  try {
    const r = await fetch(url, { method: 'POST', headers, body: form });
    const text = await r.text();
    res.status(r.status).type('application/json').send(text);
  } catch (e) {
    res.status(502).json({ error: 'Falha ao contactar o CMS.', message: e.message || String(e) });
  }
});

module.exports = router;
