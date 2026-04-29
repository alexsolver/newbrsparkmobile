'use strict';

const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const {
  resolveCanonicalEmailNormForUser,
  resolvePreferredActiveUserForDispatchOwnerEmail,
} = require('../lib/userEmailUnique');

const router = express.Router();

const PANEL_TENANT_ROLES = new Set(['SAAS_ADMIN', 'TENANT_ADMIN', 'MANAGER']);

function timingSafeEqual(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

/**
 * POST /api/internal/laravel-evaluations-bridge
 * Chamado apenas pelo servidor Laravel (secret compartilhado). Emite JWT compatíveis com a API de avaliações.
 */
router.post('/laravel-evaluations-bridge', express.json(), async (req, res) => {
  try {
    const expected = process.env.BRSPARK_WEB_BRIDGE_SECRET;
    if (!expected || !timingSafeEqual(req.headers['x-bridge-secret'], expected)) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }

    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const tenantId = typeof req.body.tenantId === 'string' ? req.body.tenantId.trim() : '';
    if (!email || !tenantId) {
      return res.status(400).json({ error: 'email e tenantId são obrigatórios.' });
    }

    // O Laravel envia tenant_id (UUID) do CMS. No Node, `User.tenantId` referencia `Tenant.id` (cuid).
    // Aceita ambos: cuid (id) ou UUID do Laravel (laravelTenantId).
    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [{ id: tenantId }, { laravelTenantId: tenantId }],
      },
    });
    if (!tenant) {
      return res.status(404).json({
        error:
          'Tenant não encontrado na base BrSpark (PostgreSQL). Confirme se o tenant do Laravel foi provisionado e está ligado ao tenant do Node.',
      });
    }

    const user = await resolvePreferredActiveUserForDispatchOwnerEmail(prisma, email, {
      tenantId: tenant.id,
      include: { tenant: true },
    });
    if (!user) {
      return res.status(404).json({
        error:
          'Utilizador não encontrado na base BrSpark (PostgreSQL). O e-mail e tenant devem coincidir com uma conta de app/painel Node.',
      });
    }
    if (user.tenant?.status === 'SUSPENDED' || user.tenant?.status === 'CANCELLED') {
      return res.status(403).json({ error: 'Organização suspensa ou cancelada.' });
    }

    let sessionId = user.currentSessionId;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      await prisma.user.update({
        where: { id: user.id },
        data: { currentSessionId: sessionId },
      });
    }

    const jwtEmail = await resolveCanonicalEmailNormForUser(prisma, user);
    const appToken = jwt.sign(
      {
        id: user.id,
        tenantId: user.tenantId,
        email: jwtEmail,
        role: user.role,
        sessionId,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    let panelToken = null;
    if (PANEL_TENANT_ROLES.has(user.role) && user.tenant) {
      panelToken = jwt.sign(
        {
          panel: true,
          userId: user.id,
          tenantId: user.tenantId,
          email: jwtEmail,
          name: user.name,
          role: user.role,
          tenantSlug: user.tenant.slug,
          tenantName: user.tenant.name,
        },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );
    }

    res.json({
      appToken,
      panelToken,
      nodeUser: {
        id: user.id,
        role: user.role,
        name: user.name,
        email: jwtEmail,
      },
      tenantId: user.tenantId,
    });
  } catch (err) {
    console.error('[laravel-evaluations-bridge]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
