'use strict';

const crypto = require('crypto');
const express = require('express');
const prisma = require('../db');
const { resolvePreferredActiveUserForDispatchOwnerEmail } = require('../lib/userEmailUnique');

const router = express.Router();

function timingSafeBearer(expected, headerVal) {
  const exp = Buffer.from(String(expected || '').trim(), 'utf8');
  const got = Buffer.from(String(headerVal || '').replace(/^Bearer\s+/i, '').trim(), 'utf8');
  if (!exp.length || exp.length !== got.length) return false;
  return crypto.timingSafeEqual(exp, got);
}

/**
 * @param {string} slug
 * @param {string} ownerEmail
 */
async function resolveTenantForCmsMirror(slug, ownerEmail) {
  const s = String(slug || '').trim().toLowerCase();
  const em = String(ownerEmail || '').trim().toLowerCase();
  if (s) {
    const bySlug = await prisma.tenant.findFirst({
      where: { slug: { equals: s, mode: 'insensitive' } },
    });
    if (bySlug) return bySlug;
  }
  if (em) {
    const byTenantEmail = await prisma.tenant.findFirst({
      where: { email: { equals: em, mode: 'insensitive' } },
    });
    if (byTenantEmail) return byTenantEmail;
    const user = await resolvePreferredActiveUserForDispatchOwnerEmail(prisma, em, {
      include: { tenant: true },
    });
    if (user?.tenant) return user.tenant;
  }
  return null;
}

/**
 * POST /api/internal/cms-branding-mirror
 * Chamado pelo Laravel (CMS) após gravar logo/cores — atualiza `tenant.features.cmsBrandingMirror`.
 */
router.post('/cms-branding-mirror', express.json({ limit: '256kb' }), async (req, res) => {
  try {
    const token = (process.env.CMS_INTERNAL_API_TOKEN || process.env.ARIA_INTERNAL_API_TOKEN || '').trim();
    if (!token || !timingSafeBearer(token, req.headers.authorization)) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }
    const slug = typeof req.body.tenantSlug === 'string' ? req.body.tenantSlug.trim().toLowerCase() : '';
    const ownerEmail = typeof req.body.ownerEmail === 'string' ? req.body.ownerEmail.trim().toLowerCase() : '';
    const mirror = req.body.brandingMirror && typeof req.body.brandingMirror === 'object' && !Array.isArray(req.body.brandingMirror)
      ? req.body.brandingMirror
      : null;
    if (!mirror) {
      return res.status(400).json({ error: 'brandingMirror (objeto) é obrigatório.' });
    }
    if (!slug && !ownerEmail) {
      return res.status(400).json({ error: 'Informe tenantSlug (subdomínio) ou ownerEmail (e-mail do utilizador que grava no CMS).' });
    }

    const tenant = await resolveTenantForCmsMirror(slug, ownerEmail);
    if (!tenant) {
      return res.status(404).json({
        error:
          'Organização não encontrada no Node. O slug do subdomínio Laravel deve coincidir com o slug no PostgreSQL, ou o e-mail do utilizador autenticado no CMS deve ser o mesmo da conta (tenant ou utilizador) no app.',
      });
    }

    const prev = tenant.features && typeof tenant.features === 'object' && !Array.isArray(tenant.features) ? tenant.features : {};
    const nextFeatures = {
      ...prev,
      cmsBrandingMirror: {
        ...(prev.cmsBrandingMirror && typeof prev.cmsBrandingMirror === 'object' ? prev.cmsBrandingMirror : {}),
        ...mirror,
        syncedAt: new Date().toISOString(),
      },
    };

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { features: nextFeatures },
    });

    return res.json({ ok: true, tenantId: tenant.id });
  } catch (err) {
    console.error('[cms-branding-mirror]', err);
    return res.status(500).json({ error: err.message || 'Falha ao gravar espelho de branding.' });
  }
});

module.exports = router;
