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
    const { type } = req.query;
    const docs = await prisma.complianceDoc.findMany({
      where: type ? { type } : {},
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { acceptances: true } } }
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

router.post('/', async (req, res) => {
  try {
    const { type, version, title, content, publish = false, locale: localeIn } = req.body;
    if (!type || !version || !title || !content)
      return res.status(400).json({ error: 'Campos obrigatórios: type, version, title, content.' });
    const locale = String(localeIn || 'pt-BR').trim();
    if (!ALLOWED_LOCALES.has(locale)) {
      return res.status(400).json({ error: 'locale deve ser pt-BR, en-US, es-ES ou de-DE.' });
    }
    if (publish) {
      await prisma.complianceDoc.updateMany({
        where: { type, isActive: true, locale, tenantId: null },
        data: { isActive: false },
      });
    }
    const doc = await prisma.complianceDoc.create({
      data: {
        type,
        version,
        title,
        content,
        locale,
        isActive: publish,
        publishedAt: publish ? new Date() : null,
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
    const { version, title, content, locale: localeIn } = req.body;
    if (localeIn !== undefined) {
      const loc = String(localeIn).trim();
      if (!ALLOWED_LOCALES.has(loc)) {
        return res.status(400).json({ error: 'locale deve ser pt-BR, en-US, es-ES ou de-DE.' });
      }
    }
    const updated = await prisma.complianceDoc.update({
      where: { id: req.params.id },
      data: {
        ...(version !== undefined && { version }),
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(localeIn !== undefined && { locale: String(localeIn).trim() }),
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
    const whereDeactivate = doc.tenantId
      ? { type: doc.type, isActive: true, locale: doc.locale, tenantId: doc.tenantId }
      : { type: doc.type, isActive: true, locale: doc.locale, tenantId: null };
    await prisma.complianceDoc.updateMany({ where: whereDeactivate, data: { isActive: false } });
    const updated = await prisma.complianceDoc.update({
      where: { id: req.params.id }, data: { isActive: true, publishedAt: new Date() }
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

// DELETE /api/compliance/:id — remove a document version (only if not active, unless ?force=1)
router.delete('/:id', async (req, res) => {
  try {
    const force = String(req.query.force || '') === '1' || String(req.query.force || '').toLowerCase() === 'true';
    const doc = await prisma.complianceDoc.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado.' });
    if (doc.isActive && !force) {
      return res.status(400).json({ error: 'Não é possível excluir um documento ativo. Publique outra versão primeiro, ou use ?force=1 no painel (excluir vigente).' });
    }
    await prisma.consentRecord.updateMany({ where: { docId: req.params.id }, data: { docId: null } });
    await prisma.complianceAcceptance.deleteMany({ where: { docId: req.params.id } });
    await prisma.complianceDoc.delete({ where: { id: req.params.id } });
    await prisma.auditLog.create({
      data: {
        ...auditActor(req),
        action: doc.isActive && force ? 'COMPLIANCE_DELETE_FORCE' : 'COMPLIANCE_DELETE',
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
    const type = req.params.type.toUpperCase();
    const versions = await prisma.complianceDoc.findMany({
      where: { type },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { acceptances: true } } },
    });
    res.json(versions);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

