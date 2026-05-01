'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const prisma = require('../db');
const { isProviderFirstNetworkEnabled } = require('../lib/providerFirstNetwork');
const {
  resolveProviderAffiliationOnboardingDefinition,
  loadMasterTenantFeatures,
} = require('../lib/providerAffiliationOnboardingSchema');
const { buildRegistrationSnapshotFromRow } = require('../lib/providerAffiliationRegistrationSnapshot');
const { diditCreateVerificationSession, diditGetSessionDecision } = require('../lib/diditVerification');
const { verifyWebOnboardingMandatoryFaces } = require('../lib/providerAffiliationOnboardingFaces');
const { VENDOR_PREFIX } = require('./diditWebhook');
const {
  resolveProviderWebOnboardingOrigin,
  buildProviderOnboardPageUrl,
} = require('../lib/providerWebOnboardingUrl');

const router = express.Router();
const uploadRoot = path.join(__dirname, '../../uploads/provider-affiliate-onboarding');

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {
    /* ignore */
  }
}

async function loadAffiliationByInviteToken(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  return prisma.providerTenantAffiliation.findFirst({
    where: { invitationToken: t },
    include: {
      tenant: { select: { id: true, name: true, slug: true, features: true, defaultLang: true } },
      providerIdentity: {
        select: {
          id: true,
          user: {
            select: {
              email: true,
              name: true,
              phone: true,
              avatarUrl: true,
              addressJson: true,
              personalDocuments: true,
              technicianProfile: {
                select: {
                  cft: true,
                  specialty: true,
                  skillsJson: true,
                  workScheduleJson: true,
                  serviceCoverageGeoJson: true,
                  serviceLocationIds: true,
                  professionalDocuments: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

function getOnboardingWeb(row) {
  const raw = row?.tenantDocsJson;
  const j = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const w = j.onboardingWeb;
  return w && typeof w === 'object' && !Array.isArray(w) ? w : {};
}

function mergeOnboardingWeb(row, patch) {
  const raw = row?.tenantDocsJson;
  const base = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  const prevWeb = getOnboardingWeb(row);
  const nextWeb =
    patch && typeof patch === 'object' && !Array.isArray(patch)
      ? { ...prevWeb, ...patch, mandatory: { ...(prevWeb.mandatory || {}), ...((patch.mandatory && typeof patch.mandatory === 'object' && patch.mandatory) || {}) }, custom: { ...(prevWeb.custom || {}), ...((patch.custom && typeof patch.custom === 'object' && patch.custom) || {}) }, didit: { ...(prevWeb.didit || {}), ...((patch.didit && typeof patch.didit === 'object' && patch.didit) || {}) } }
      : prevWeb;
  base.onboardingWeb = nextWeb;
  return base;
}

function trimPublicBase(u) {
  return String(u || '')
    .trim()
    .replace(/\/+$/, '');
}

function resolveProviderWebPublicBase(req) {
  return (
    trimPublicBase(process.env.PROVIDER_WEB_ONBOARDING_BASE_URL) ||
    trimPublicBase(process.env.WEB_PROVIDER_ONBOARDING_BASE_URL) ||
    trimPublicBase(process.env.BRSPARK_CMS_PUBLIC_URL) ||
    trimPublicBase(process.env.LARAVEL_APP_URL) ||
    trimPublicBase(resolveProviderWebOnboardingOrigin(req)) ||
    ''
  );
}

/**
 * @param {Record<string, unknown>} web — onboardingWeb
 * @returns {Promise<{ ok: true, source?: string } | { ok: false, code?: string, message?: string, status?: string }>}
 */
async function resolveDiditApproval(web) {
  const did = web?.didit && typeof web.didit === 'object' ? web.didit : {};
  const sid = String(did.sessionId || '').trim();
  if (!sid) return { ok: false, code: 'NO_SESSION' };
  const wds = String(did.webhookDecisionStatus || '').trim();
  const ws = String(did.webhookStatus || '').trim();
  const blob = `${wds} ${ws}`.toLowerCase();
  if (blob.includes('approved')) return { ok: true, source: 'webhook' };
  try {
    const d = await diditGetSessionDecision(sid);
    const ds = String(d.decisionStatus || d.status || '').trim().toLowerCase();
    if (ds.includes('approved')) return { ok: true, source: 'api' };
    return {
      ok: false,
      code: 'DIDIT_NOT_APPROVED',
      status: String(d.decisionStatus || d.status || wds || ws || 'pending'),
    };
  } catch (e) {
    const code = e.code === 'DIDIT_NOT_CONFIGURED' ? 'DIDIT_NOT_CONFIGURED' : 'DIDIT_DECISION_ERROR';
    return {
      ok: false,
      code,
      message: e.message || String(e),
      status: wds || ws,
    };
  }
}

function buildProfileSnapshotFromRow(row) {
  const u = row?.providerIdentity?.user;
  if (!u || typeof u !== 'object') {
    return { name: '', email: '', phone: '', avatarUrl: '' };
  }
  return {
    name: u.name != null ? String(u.name) : '',
    email: u.email != null ? String(u.email) : '',
    phone: u.phone != null ? String(u.phone) : '',
    avatarUrl: u.avatarUrl != null ? String(u.avatarUrl) : '',
  };
}

/**
 * @param {object} def — definição resolvida
 * @param {object} web — onboardingWeb
 * @param {Record<string, string>} profileSnapshot — name, email, phone, avatarUrl
 */
function validateOnboardingPayload(def, web, profileSnapshot) {
  const snap = profileSnapshot && typeof profileSnapshot === 'object' ? profileSnapshot : {};
  const m = web?.mandatory || {};
  if (def.didit?.enabled) {
    const sid = web?.didit?.sessionId;
    if (!sid || !String(sid).trim()) return { ok: false, code: 'MISSING_DIDIT_SESSION', missing: 'didit.sessionId' };
  } else {
    for (const step of def.mandatorySteps || []) {
      if (!step || !step.id) continue;
      if (!step.required) continue;
      const u = m[step.id]?.url;
      if (!u || typeof u !== 'string' || !String(u).trim()) {
        return { ok: false, code: 'MISSING_MANDATORY', missing: step.id };
      }
    }
  }
  for (const f of def.customFields || []) {
    if (!f || !f.id || !f.required) continue;
    const bind = String(f.bindFromProfile || '').trim();
    if (bind && snap[bind] != null && String(snap[bind]).trim() !== '') {
      continue;
    }
    const v = web?.custom?.[f.id];
    if (v == null || String(v).trim() === '') {
      return { ok: false, code: 'MISSING_CUSTOM', missing: f.id };
    }
  }
  return { ok: true };
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const id = req.affRow?.id || 'unknown';
    const dir = path.join(uploadRoot, String(id));
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 12) || '.bin';
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
});

async function requireInvitedAffiliation(req, res, next) {
  try {
    const token = String(req.params.token || '').trim();
    const row = await loadAffiliationByInviteToken(token);
    if (!row) {
      return res.status(404).json({ error: 'Convite não encontrado.', code: 'INVITE_NOT_FOUND' });
    }
    if (String(row.status || '').toUpperCase() !== 'INVITED') {
      return res.status(409).json({
        error: 'Este convite já foi utilizado ou não está pendente.',
        code: 'INVITE_NOT_PENDING',
      });
    }
    if (!(await isProviderFirstNetworkEnabled(row.tenantId))) {
      return res.status(403).json({
        error: 'Onboarding web indisponível para esta organização.',
        code: 'PROVIDER_FIRST_DISABLED',
      });
    }
    req.affRow = row;
    return next();
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}

/** Ficheiros servidos sem JWT — o token do convite actua como segredo temporário. */
router.get('/assets/:token/:filename', async (req, res) => {
  try {
    const row = await loadAffiliationByInviteToken(String(req.params.token || '').trim());
    if (!row) return res.status(404).end();
    const fn = path.basename(String(req.params.filename || ''));
    if (!fn || fn.includes('..')) return res.status(400).end();
    const dir = path.join(uploadRoot, String(row.id));
    const filePath = path.join(dir, fn);
    if (!filePath.startsWith(dir)) return res.status(400).end();
    if (!fs.existsSync(filePath)) return res.status(404).end();
    return res.sendFile(filePath);
  } catch (_) {
    return res.status(500).end();
  }
});

router.get('/:token/didit-status', requireInvitedAffiliation, async (req, res) => {
  try {
    const fresh = await prisma.providerTenantAffiliation.findUnique({
      where: { id: req.affRow.id },
      select: { tenantDocsJson: true, tenant: { select: { features: true } } },
    });
    const rowProxy = fresh
      ? { ...req.affRow, tenantDocsJson: fresh.tenantDocsJson, tenant: fresh.tenant || req.affRow.tenant }
      : req.affRow;
    const web = getOnboardingWeb(rowProxy);
    const masterFeatures = await loadMasterTenantFeatures(prisma);
    const definition = resolveProviderAffiliationOnboardingDefinition(rowProxy.tenant, masterFeatures);
    if (!definition.didit?.enabled) {
      return res.json({ ok: true, diditEnabled: false });
    }
    const r = await resolveDiditApproval(web);
    const did = web?.didit && typeof web.didit === 'object' ? web.didit : {};
    return res.json({
      ok: true,
      diditEnabled: true,
      approved: r.ok === true,
      source: r.source || null,
      status: r.status || null,
      code: r.code || null,
      sessionId: String(did.sessionId || '').trim() || null,
      webhookStatus: did.webhookStatus != null ? String(did.webhookStatus) : null,
      webhookDecisionStatus: did.webhookDecisionStatus != null ? String(did.webhookDecisionStatus) : null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
});

router.get('/:token', requireInvitedAffiliation, async (req, res) => {
  try {
    const row = req.affRow;
    const masterFeatures = await loadMasterTenantFeatures(prisma);
    const definition = resolveProviderAffiliationOnboardingDefinition(row.tenant, masterFeatures);
    const web = getOnboardingWeb(row);
    const profileSnapshot = buildProfileSnapshotFromRow(row);
    const registrationSnapshot = buildRegistrationSnapshotFromRow(row);
    return res.json({
      ok: true,
      tenant: {
        id: row.tenant.id,
        name: row.tenant.name,
        slug: row.tenant.slug,
        defaultLang: row.tenant.defaultLang || 'pt-BR',
      },
      providerEmail: row.providerIdentity?.user?.email || null,
      providerName: row.providerIdentity?.user?.name || null,
      profileSnapshot,
      registrationSnapshot,
      definition,
      saved: web,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
});

router.patch('/:token', requireInvitedAffiliation, express.json({ limit: '4mb' }), async (req, res) => {
  try {
    const row = req.affRow;
    const patch = req.body?.onboardingWeb;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'Envie onboardingWeb como objecto.', code: 'BAD_BODY' });
    }
    const nextDocs = mergeOnboardingWeb(row, patch);
    const updated = await prisma.providerTenantAffiliation.update({
      where: { id: row.id },
      data: { tenantDocsJson: nextDocs },
    });
    return res.json({ ok: true, saved: getOnboardingWeb(updated) });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
});

router.post('/:token/upload', requireInvitedAffiliation, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Ficheiro em falta (campo file).', code: 'NO_FILE' });
    const rel = `/api/public/provider-affiliation-onboarding/assets/${encodeURIComponent(String(req.params.token))}/${encodeURIComponent(req.file.filename)}`;
    return res.json({
      ok: true,
      filename: req.file.filename,
      url: rel,
      mimeType: req.file.mimetype || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
});

router.post('/:token/submit', requireInvitedAffiliation, express.json(), async (req, res) => {
  try {
    const row = req.affRow;
    const masterFeatures = await loadMasterTenantFeatures(prisma);
    const definition = resolveProviderAffiliationOnboardingDefinition(row.tenant, masterFeatures);
    const web = getOnboardingWeb(row);
    const v = validateOnboardingPayload(definition, web, buildProfileSnapshotFromRow(row));
    if (!v.ok) {
      return res.status(400).json({
        error: 'Formulário incompleto.',
        code: v.code || 'INCOMPLETE',
        missing: v.missing || null,
      });
    }
    if (definition.didit?.enabled) {
      const dr = await resolveDiditApproval(web);
      if (!dr.ok) {
        return res.status(400).json({
          error:
            dr.message ||
            'A verificação Didit ainda não está aprovada. Conclua o fluxo Didit e aguarde alguns segundos antes de enviar.',
          code: dr.code || 'DIDIT_NOT_APPROVED',
          status: dr.status || null,
        });
      }
    } else if (definition.faceVerificationOnSubmit) {
      const fv = await verifyWebOnboardingMandatoryFaces(prisma, row.tenantId, row.id, web);
      if (!fv.ok) {
        return res.status(400).json({
          error: fv.message || 'Verificação facial falhou.',
          code: fv.code || 'FACE_VERIFY_FAILED',
        });
      }
    }
    const now = new Date();
    const updated = await prisma.providerTenantAffiliation.update({
      where: { id: row.id },
      data: {
        status: 'REQUESTED',
        requestedAt: now,
        invitationToken: null,
        tenantDocsJson: mergeOnboardingWeb(row, {
          submittedAt: now.toISOString(),
          submittedFrom: 'web_onboarding',
        }),
      },
    });
    return res.json({
      ok: true,
      affiliation: {
        id: updated.id,
        status: updated.status,
        requestedAt: updated.requestedAt,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
});

router.post('/:token/didit-session', requireInvitedAffiliation, express.json(), async (req, res) => {
  try {
    const row = req.affRow;
    const masterFeatures = await loadMasterTenantFeatures(prisma);
    const definition = resolveProviderAffiliationOnboardingDefinition(row.tenant, masterFeatures);
    if (!definition.didit?.enabled) {
      return res.status(400).json({
        ok: false,
        code: 'DIDIT_DISABLED',
        message: 'Didit não está activo para esta organização.',
      });
    }
    const wf = String(definition.didit.workflowId || '').trim();
    if (!wf) {
      return res.status(501).json({
        ok: false,
        code: 'DIDIT_WORKFLOW_MISSING',
        message: 'Configure workflow Didit nas features do tenant ou DIDIT_WORKFLOW_ID no servidor.',
      });
    }
    const inviteToken = String(req.params.token || '').trim();
    const base = resolveProviderWebPublicBase(req);
    if (!base) {
      return res.status(503).json({
        ok: false,
        code: 'PUBLIC_WEB_BASE_MISSING',
        message:
          'Defina PROVIDER_WEB_ONBOARDING_BASE_URL, PUBLIC_API_BASE ou TRACKING_PUBLIC_BASE_URL para o callback Didit voltar a provider-onboard.html.',
      });
    }
    const callbackUrl = buildProviderOnboardPageUrl(base, inviteToken);
    const email = row.providerIdentity?.user?.email || undefined;
    let created;
    try {
      created = await diditCreateVerificationSession({
        workflowId: wf,
        callbackUrl,
        vendorData: `${VENDOR_PREFIX}${row.id}`,
        email,
        metadata: { affiliationId: row.id, tenantId: row.tenantId },
      });
    } catch (e) {
      const code = e.code || 'DIDIT_API_ERROR';
      const status = e.code === 'DIDIT_NOT_CONFIGURED' ? 501 : 502;
      return res.status(status).json({
        ok: false,
        code,
        message: e.message || String(e),
      });
    }
    const sessionId = String(created.sessionId || '').trim();
    const verificationUrl = String(created.verificationUrl || '').trim();
    if (!sessionId || !verificationUrl) {
      return res.status(502).json({
        ok: false,
        code: 'DIDIT_BAD_RESPONSE',
        message: 'Resposta Didit sem session_id ou verification_url.',
      });
    }
    const nextDocs = mergeOnboardingWeb(row, {
      didit: {
        sessionId,
        verificationUrl,
        sessionCreatedAt: new Date().toISOString(),
        workflowId: wf,
      },
    });
    const updated = await prisma.providerTenantAffiliation.update({
      where: { id: row.id },
      data: { tenantDocsJson: nextDocs },
    });
    return res.json({
      ok: true,
      sessionId,
      verificationUrl,
      saved: getOnboardingWeb(updated),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
});

module.exports = router;
