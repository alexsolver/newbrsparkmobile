'use strict';

const express = require('express');
const prisma = require('../db');
const authUser = require('../middleware/authUser');
const { resolveAppEffectiveTenantId } = require('../lib/appLoginEffectiveTenant');
const { getEffectivePolicy } = require('../lib/effectiveCollectionPolicy');
const { normalizeGpsCapturePolicy } = require('../lib/gpsCapturePolicy');

const router = express.Router();

/**
 * Política GPS efetiva para o utilizador autenticado (tenant efetiva = afiliação dedicada, etc.).
 * Usado pelo app mesmo quando o módulo de ponto está desligado.
 */
router.get('/me', authUser, async (req, res) => {
  try {
    const resolvedTenant = await resolveAppEffectiveTenantId(prisma, req.user.id);
    const tenantId =
      resolvedTenant && String(resolvedTenant).trim()
        ? String(resolvedTenant).trim()
        : String(req.user.tenantId || '').trim();
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant não resolvido.' });
    }
    const collectionEff = await getEffectivePolicy(tenantId, null);
    res.json({
      tenantId,
      policy: normalizeGpsCapturePolicy(collectionEff.gpsCapturePolicy),
    });
  } catch (err) {
    console.error('GET /gps-capture-policy/me', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
