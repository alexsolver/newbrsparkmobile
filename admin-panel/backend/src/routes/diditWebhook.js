'use strict';

const prisma = require('../db');
const { verifyDiditWebhookSignature } = require('../lib/diditVerification');

const VENDOR_PREFIX = 'brspark_pao:';

function mergeTenantDocsDidit(row, patch) {
  const raw = row?.tenantDocsJson;
  const base = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  const prevWeb = base.onboardingWeb && typeof base.onboardingWeb === 'object' ? base.onboardingWeb : {};
  const prevDidit = prevWeb.didit && typeof prevWeb.didit === 'object' ? prevWeb.didit : {};
  base.onboardingWeb = {
    ...prevWeb,
    didit: { ...prevDidit, ...patch },
  };
  return base;
}

/**
 * Express handler — usar com `express.raw({ type: 'application/json' })`.
 */
async function diditWebhookHandler(req, res) {
  try {
    const secret = String(process.env.DIDIT_WEBHOOK_SECRET || '').trim();
    if (!secret) {
      return res.status(503).json({ ok: false, error: 'DIDIT_WEBHOOK_SECRET não configurado.' });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''), 'utf8');
    const sig = req.headers['x-signature-v2'] || req.headers['x-signature'];
    const ts = req.headers['x-timestamp'];

    if (!verifyDiditWebhookSignature(rawBody, Array.isArray(sig) ? sig[0] : sig, Array.isArray(ts) ? ts[0] : ts, secret)) {
      return res.status(401).json({ ok: false, error: 'Assinatura webhook inválida.' });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ ok: false, error: 'JSON inválido.' });
    }

    const vendorData = payload.vendor_data != null ? String(payload.vendor_data) : '';
    if (!vendorData.startsWith(VENDOR_PREFIX)) {
      return res.json({ ok: true, ignored: true });
    }

    const affiliationId = vendorData.slice(VENDOR_PREFIX.length).trim();
    if (!affiliationId) return res.json({ ok: true, ignored: true });

    const row = await prisma.providerTenantAffiliation.findUnique({
      where: { id: affiliationId },
      select: { id: true, tenantDocsJson: true },
    });
    if (!row) return res.json({ ok: true, ignored: true, reason: 'affiliation_not_found' });

    const sessionId = payload.session_id != null ? String(payload.session_id) : '';
    const status = payload.status != null ? String(payload.status) : '';
    const decision = payload.decision && typeof payload.decision === 'object' ? payload.decision : null;
    const decisionStatus = decision && decision.status != null ? String(decision.status) : '';

    await prisma.providerTenantAffiliation.update({
      where: { id: row.id },
      data: {
        tenantDocsJson: mergeTenantDocsDidit(row, {
          sessionId: sessionId || undefined,
          webhookStatus: status,
          webhookDecisionStatus: decisionStatus || undefined,
          webhookAt: new Date().toISOString(),
          webhookType: payload.webhook_type != null ? String(payload.webhook_type) : undefined,
        }),
      },
    });

    return res.json({ ok: true, received: true });
  } catch (e) {
    console.error('[diditWebhook]', e);
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}

module.exports = { diditWebhookHandler, VENDOR_PREFIX };
