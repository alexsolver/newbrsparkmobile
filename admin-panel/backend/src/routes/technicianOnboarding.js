'use strict';

const express = require('express');
const authUser = require('../middleware/authUser');
const prisma = require('../db');
const { deliverBrsparkLaravelEvent, EVENT_TYPES } = require('../lib/brsparkSyncWebhook');
const { isProviderFirstNetworkEnabled } = require('../lib/providerFirstNetwork');

const router = express.Router();

// POST /api/technician-onboarding/accept-terms
router.post('/accept-terms', authUser, express.json(), async (req, res) => {
  try {
    const v = String(req.body?.termsVersion || '1.0').trim() || '1.0';
    if (!req.body?.accept) {
      return res.status(400).json({ error: 'É necessário aceitar os termos.' });
    }
    await prisma.user.update({
      where: { id: req.user.id },
      data: { termsAcceptedAt: new Date(), termsVersion: v },
    });
    return res.json({ ok: true, termsVersion: v });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/technician-onboarding/esign — URL de assinatura (ZapSign / Clicksign) quando configurado
router.get('/esign', authUser, async (req, res) => {
  try {
    const base = String(process.env.E_SIGN_IFRAME_BASE_URL || process.env.ZAPSIGN_IFRAME_BASE_URL || '').trim();
    if (!base) {
      return res.json({
        configured: false,
        message: 'Defina E_SIGN_IFRAME_BASE_URL no ambiente (URL de assinatura do fornecedor).',
      });
    }
    const sep = base.includes('?') ? '&' : '?';
    const url = `${base.replace(/\/+$/, '')}${sep}externalId=${encodeURIComponent(req.user.id)}&email=${encodeURIComponent(
      req.user.email || ''
    )}`;
    return res.json({ configured: true, url, provider: process.env.E_SIGN_PROVIDER || 'custom' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/technician-onboarding/esign-callback (webhook do fornecedor — assinatura concluída)
router.post('/esign-callback', express.json(), async (req, res) => {
  try {
    const secret = String(process.env.E_SIGN_WEBHOOK_SECRET || '').trim();
    if (secret) {
      const h = String(req.headers['x-signature'] || req.headers['x-webhook-signature'] || '');
      if (!h || h !== secret) {
        return res.status(401).json({ error: 'Assinatura inválida' });
      }
    }
    const userId = String(req.body?.userId || req.body?.externalId || '').trim();
    const pdfUrl = String(req.body?.signedPdfUrl || req.body?.documentUrl || '').trim();
    if (userId && pdfUrl) {
      await prisma.user
        .update({ where: { id: userId }, data: { platformContractUrl: pdfUrl } })
        .catch(() => {});
    }
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/technician-onboarding/kyc/start — inicia processamento KYC (orquestrador; detalhe no fornecedor)
router.post('/kyc/start', authUser, express.json(), async (req, res) => {
  try {
    const enabled = await isProviderFirstNetworkEnabled(req.user.tenantId);
    if (!enabled) {
      return res.status(403).json({ code: 'PROVIDER_FIRST_DISABLED', error: 'Rede de prestadores global desativada.' });
    }
    const provider = String(req.body?.provider || process.env.KYC_DEFAULT_PROVIDER || 'pending').trim();
    const updated = await prisma.providerIdentity.upsert({
      where: { userId: req.user.id },
      create: {
        userId: req.user.id,
        globalStatus: 'PENDING',
        kycStatus: 'PROCESSING',
        kycProvider: provider,
        kycExternalId: null,
      },
      update: {
        kycStatus: 'PROCESSING',
        kycProvider: provider,
      },
    });
    deliverBrsparkLaravelEvent({
      type: EVENT_TYPES.KYC_STATUS_CHANGED,
      idempotencyKey: `kyc-${req.user.id}-${Date.now()}`,
      payload: {
        userId: req.user.id,
        tenantId: req.user.tenantId,
        kycStatus: updated.kycStatus,
        kycProvider: provider,
      },
    }).catch(() => {});
    return res.json({ ok: true, kycStatus: updated.kycStatus, kycProvider: updated.kycProvider });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
