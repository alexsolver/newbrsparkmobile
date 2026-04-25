'use strict';
const router = require('express').Router();
const prisma = require('../db');
const { auditActor } = require('../lib/auditActor');
const {
  findPublishedComplianceDoc,
  listActiveComplianceDocsForLocale,
} = require('../lib/complianceLocale');

// ─── PUBLIC routes (no admin auth — used by the mobile app) ──────────────────

// GET /api/compliance/active — active docs list (title + type only, lightweight)
router.get('/active', async (req, res) => {
  try {
    const { tenantId, locale } = req.query;
    const docs = await listActiveComplianceDocsForLocale(prisma, {
      tenantId: typeof tenantId === 'string' && tenantId.trim() ? tenantId.trim() : null,
      localeHint: typeof locale === 'string' ? locale : null,
    });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/compliance/active/:type — full content of a specific active document (locale via ?locale=)
router.get('/active/:type', async (req, res) => {
  try {
    const { tenantId, locale } = req.query;
    const doc = await findPublishedComplianceDoc(prisma, {
      type: req.params.type.toUpperCase(),
      tenantId: typeof tenantId === 'string' && tenantId.trim() ? tenantId.trim() : null,
      localeHint: typeof locale === 'string' ? locale : null,
    });
    if (!doc) return res.status(404).json({ error: 'Documento ativo não encontrado.' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN routes (require adminAuth middleware applied in index.js) ──────────

// GET /api/compliance — list all docs (with acceptance counts)
router.get('/', async (req, res) => {
  try {
    const { type, locale, reviewStatus, audience, platform, jurisdiction, includeArchived } = req.query;
    const where = {};
    const docType = type ? normalizeDocType(type) : null;
    if (type && !docType) return res.status(400).json({ error: 'Tipo de documento inválido.' });
    if (docType) where.type = docType;
    if (locale) where.locale = String(locale).trim();
    if (reviewStatus) {
      const status = String(reviewStatus).trim().toUpperCase();
      if (!ALLOWED_REVIEW_STATUS.has(status)) return res.status(400).json({ error: 'Status jurídico inválido.' });
      where.reviewStatus = status;
    }
    if (audience) where.audience = String(audience).trim().toUpperCase();
    if (platform) where.platform = String(platform).trim().toUpperCase();
    if (jurisdiction) where.jurisdiction = String(jurisdiction).trim().toUpperCase();
    if (String(includeArchived || '').toLowerCase() !== 'true') where.archivedAt = null;
    const docs = await prisma.complianceDoc.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { acceptances: true, consentRecords: true } } }
    });
    res.json(docs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/compliance/:id — full document
router.get('/:id', async (req, res) => {
  try {
    const doc = await prisma.complianceDoc.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { acceptances: true } } }
    });
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado.' });
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/compliance — create new version (optionally publish immediately)
const ALLOWED_LOCALES = new Set(['pt-BR', 'en-US', 'es-ES', 'de-DE']);
const ALLOWED_DOC_TYPES = new Set([
  'TERMS_OF_USE',
  'PRIVACY_POLICY',
  'LGPD_DPA',
  'COOKIE_POLICY',
  'MOBILE_EULA',
  'LOCATION_NOTICE',
  'BIOMETRIC_NOTICE',
  'WORK_TIME_POLICY',
  'AI_USAGE_POLICY',
  'DATA_RETENTION_POLICY',
  'SUBPROCESSORS_LIST',
  'SLA_SUPPORT_POLICY',
  'BILLING_REFUND_POLICY',
  'PROVIDER_TERMS',
  'KYC_NOTICE',
  'ACCEPTABLE_USE_POLICY',
  'SECURITY_POLICY',
]);
const ALLOWED_REVIEW_STATUS = new Set(['DRAFT', 'LEGAL_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED']);

function cleanString(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  const s = String(value).trim();
  return s === '' ? fallback : s;
}

function cleanBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'sim'].includes(s)) return true;
  if (['0', 'false', 'no', 'nao', 'não'].includes(s)) return false;
  return fallback;
}

function cleanDate(value) {
  const raw = cleanString(value);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeDocType(value) {
  const type = String(value || '').trim().toUpperCase();
  return ALLOWED_DOC_TYPES.has(type) ? type : null;
}

function complianceDocData(body, { forCreate = false } = {}) {
  const reviewStatusRaw = cleanString(body.reviewStatus);
  const reviewStatus = reviewStatusRaw ? reviewStatusRaw.toUpperCase() : null;
  const legalBasis = cleanString(body.legalBasis);
  return {
    ...(body.version !== undefined && { version: cleanString(body.version, '') }),
    ...(body.title !== undefined && { title: cleanString(body.title, '') }),
    ...(body.content !== undefined && { content: cleanString(body.content, '') }),
    ...(body.locale !== undefined && { locale: cleanString(body.locale, 'pt-BR') }),
    ...(body.effectiveFrom !== undefined && { effectiveFrom: cleanDate(body.effectiveFrom) }),
    ...(reviewStatus && ALLOWED_REVIEW_STATUS.has(reviewStatus) && { reviewStatus }),
    ...(body.reviewedBy !== undefined && { reviewedBy: cleanString(body.reviewedBy) }),
    ...(body.changeSummary !== undefined && { changeSummary: cleanString(body.changeSummary) }),
    ...(body.audience !== undefined || forCreate ? { audience: cleanString(body.audience, 'ALL').toUpperCase() } : {}),
    ...(body.platform !== undefined || forCreate ? { platform: cleanString(body.platform, 'ALL').toUpperCase() } : {}),
    ...(body.jurisdiction !== undefined || forCreate ? { jurisdiction: cleanString(body.jurisdiction, 'GLOBAL').toUpperCase() } : {}),
    ...(body.legalBasis !== undefined ? { legalBasis: legalBasis ? legalBasis.toUpperCase() : null } : {}),
    ...(body.requiresAcceptance !== undefined || forCreate ? { requiresAcceptance: cleanBool(body.requiresAcceptance, true) } : {}),
    ...(body.blocking !== undefined || forCreate ? { blocking: cleanBool(body.blocking, true) } : {}),
  };
}

router.post('/', async (req, res) => {
  try {
    const { version, title, content, publish = false, locale: localeIn } = req.body;
    const type = normalizeDocType(req.body.type);
    if (!type) return res.status(400).json({ error: 'Tipo de documento inválido.' });
    if (!type || !version || !title || !content)
      return res.status(400).json({ error: 'Campos obrigatórios: type, version, title, content.' });
    const locale = String(localeIn || 'pt-BR').trim();
    if (!ALLOWED_LOCALES.has(locale)) {
      return res.status(400).json({ error: 'locale deve ser pt-BR, en-US, es-ES ou de-DE.' });
    }
    if (publish) {
      await prisma.complianceDoc.updateMany({
        where: { type, isActive: true, locale, tenantId: null, archivedAt: null },
        data: { isActive: false, reviewStatus: 'ARCHIVED', archivedAt: new Date() },
      });
    }
    const data = complianceDocData({ ...req.body, type, locale }, { forCreate: true });
    const doc = await prisma.complianceDoc.create({
      data: {
        type,
        ...data,
        isActive: publish,
        publishedAt: publish ? new Date() : null,
        effectiveFrom: data.effectiveFrom || (publish ? new Date() : null),
        reviewStatus: publish ? 'PUBLISHED' : (data.reviewStatus || 'DRAFT'),
        createdBy: req.admin.email,
      },
    });
    await prisma.auditLog.create({
      data: {
        ...auditActor(req),
        action: 'COMPLIANCE_CREATE',
        resource: `${type} v${version}`,
        category: 'ADMIN',
      },
    });
    res.status(201).json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/compliance/:id — update content/version/title (does NOT change isActive)
router.patch('/:id', async (req, res) => {
  try {
    const { locale: localeIn } = req.body;
    if (localeIn !== undefined) {
      const loc = String(localeIn).trim();
      if (!ALLOWED_LOCALES.has(loc)) {
        return res.status(400).json({ error: 'locale deve ser pt-BR, en-US, es-ES ou de-DE.' });
      }
    }
    const current = await prisma.complianceDoc.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Documento não encontrado.' });
    if (current.archivedAt) return res.status(400).json({ error: 'Documento arquivado não pode ser editado.' });
    const data = complianceDocData(req.body);
    const updated = await prisma.complianceDoc.update({
      where: { id: req.params.id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/compliance/:id/publish — publish (activate) a specific version
router.patch('/:id/publish', async (req, res) => {
  try {
    const doc = await prisma.complianceDoc.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: 'Não encontrado.' });
    if (doc.archivedAt) return res.status(400).json({ error: 'Documento arquivado não pode ser publicado.' });
    const whereDeactivate = doc.tenantId
      ? { type: doc.type, isActive: true, locale: doc.locale, tenantId: doc.tenantId, archivedAt: null }
      : { type: doc.type, isActive: true, locale: doc.locale, tenantId: null, archivedAt: null };
    await prisma.complianceDoc.updateMany({
      where: whereDeactivate,
      data: { isActive: false, reviewStatus: 'ARCHIVED', archivedAt: new Date() },
    });
    const updated = await prisma.complianceDoc.update({
      where: { id: req.params.id },
      data: {
        isActive: true,
        publishedAt: new Date(),
        effectiveFrom: doc.effectiveFrom || new Date(),
        reviewStatus: 'PUBLISHED',
        reviewedBy: doc.reviewedBy || req.admin.email,
        reviewedAt: doc.reviewedAt || new Date(),
        archivedAt: null,
      },
    });
    await prisma.auditLog.create({
      data: {
        ...auditActor(req),
        action: 'COMPLIANCE_PUBLISH',
        resource: `${doc.type} v${doc.version}`,
        category: 'ADMIN',
      },
    });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/compliance/:id/review — mark legal review status without publishing
router.patch('/:id/review', async (req, res) => {
  try {
    const reviewStatus = String(req.body.reviewStatus || '').trim().toUpperCase();
    if (!ALLOWED_REVIEW_STATUS.has(reviewStatus) || reviewStatus === 'PUBLISHED' || reviewStatus === 'ARCHIVED') {
      return res.status(400).json({ error: 'reviewStatus deve ser DRAFT, LEGAL_REVIEW ou APPROVED.' });
    }
    const updated = await prisma.complianceDoc.update({
      where: { id: req.params.id },
      data: {
        reviewStatus,
        reviewedBy: reviewStatus === 'APPROVED' ? (cleanString(req.body.reviewedBy) || req.admin.email) : cleanString(req.body.reviewedBy),
        reviewedAt: reviewStatus === 'APPROVED' ? new Date() : null,
        changeSummary: req.body.changeSummary !== undefined ? cleanString(req.body.changeSummary) : undefined,
      },
    });
    await prisma.auditLog.create({
      data: {
        ...auditActor(req),
        action: 'COMPLIANCE_REVIEW_STATUS',
        resource: `${updated.type} v${updated.version} -> ${reviewStatus}`,
        category: 'ADMIN',
      },
    });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/compliance/:id/archive — legal-safe removal from active catalog
router.patch('/:id/archive', async (req, res) => {
  try {
    const doc = await prisma.complianceDoc.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado.' });
    const updated = await prisma.complianceDoc.update({
      where: { id: req.params.id },
      data: { isActive: false, reviewStatus: 'ARCHIVED', archivedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        ...auditActor(req),
        action: 'COMPLIANCE_ARCHIVE',
        resource: `${doc.type} v${doc.version}`,
        category: 'ADMIN',
      },
    });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/compliance/:id — remove draft versions only; published/accepted docs are archived
router.delete('/:id', async (req, res) => {
  try {
    const force = String(req.query.force || '') === '1' || String(req.query.force || '').toLowerCase() === 'true';
    const doc = await prisma.complianceDoc.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { acceptances: true, consentRecords: true } } },
    });
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado.' });
    const hasLegalEvidence = doc.isActive || doc.publishedAt || doc._count.acceptances > 0 || doc._count.consentRecords > 0;
    if (hasLegalEvidence || force) {
      const archived = await prisma.complianceDoc.update({
        where: { id: req.params.id },
        data: { isActive: false, reviewStatus: 'ARCHIVED', archivedAt: doc.archivedAt || new Date() },
      });
      await prisma.auditLog.create({
        data: {
          ...auditActor(req),
          action: force ? 'COMPLIANCE_FORCE_ARCHIVE' : 'COMPLIANCE_ARCHIVE',
          resource: `${doc.type} v${doc.version}`,
          category: 'ADMIN',
        },
      });
      return res.json({ ok: true, archived: true, doc: archived });
    }
    await prisma.consentRecord.updateMany({ where: { docId: req.params.id }, data: { docId: null } });
    await prisma.complianceAcceptance.deleteMany({ where: { docId: req.params.id } });
    await prisma.complianceDoc.delete({ where: { id: req.params.id } });
    await prisma.auditLog.create({
      data: {
        ...auditActor(req),
        action: 'COMPLIANCE_DELETE_DRAFT',
        resource: `${doc.type} v${doc.version}`,
        category: 'ADMIN',
      },
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/compliance/:type/history — full version history for a document type
// Returns all versions ordered newest-first, with acceptance counts
router.get('/:type/history', async (req, res) => {
  try {
    const type = normalizeDocType(req.params.type);
    if (!type) return res.status(400).json({ error: 'Tipo de documento inválido.' });
    const versions = await prisma.complianceDoc.findMany({
      where: { type },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { acceptances: true, consentRecords: true } } },
    });
    res.json(versions);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

