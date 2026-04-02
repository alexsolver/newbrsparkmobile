'use strict';
const router = require('express').Router();
const prisma  = require('../db');

// ─── PUBLIC routes (no admin auth — used by the mobile app) ──────────────────

// GET /api/compliance/active — active docs list (title + type only, lightweight)
router.get('/active', async (_req, res) => {
  try {
    const docs = await prisma.complianceDoc.findMany({
      where: { isActive: true },
      select: { id: true, type: true, version: true, title: true, publishedAt: true },
      orderBy: { type: 'asc' },
    });
    res.json(docs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/compliance/active/:type — full content of a specific active document
// Used by mobile app to show Terms of Use / Privacy Policy inline
router.get('/active/:type', async (req, res) => {
  try {
    const doc = await prisma.complianceDoc.findFirst({
      where: { type: req.params.type.toUpperCase(), isActive: true },
      orderBy: { publishedAt: 'desc' },
    });
    if (!doc) return res.status(404).json({ error: 'Documento ativo não encontrado.' });
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
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
router.post('/', async (req, res) => {
  try {
    const { type, version, title, content, publish = false } = req.body;
    if (!type || !version || !title || !content)
      return res.status(400).json({ error: 'Campos obrigatórios: type, version, title, content.' });
    if (publish) {
      await prisma.complianceDoc.updateMany({ where: { type, isActive: true }, data: { isActive: false } });
    }
    const doc = await prisma.complianceDoc.create({
      data: { type, version, title, content, isActive: publish, publishedAt: publish ? new Date() : null, createdBy: req.admin.email }
    });
    await prisma.auditLog.create({
      data: { adminId: req.admin.id, action: 'COMPLIANCE_CREATE', resource: `${type} v${version}`, category: 'ADMIN' }
    });
    res.status(201).json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/compliance/:id — update content/version/title (does NOT change isActive)
router.patch('/:id', async (req, res) => {
  try {
    const { version, title, content } = req.body;
    const updated = await prisma.complianceDoc.update({
      where: { id: req.params.id },
      data: {
        ...(version !== undefined && { version }),
        ...(title   !== undefined && { title }),
        ...(content !== undefined && { content }),
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
    await prisma.complianceDoc.updateMany({ where: { type: doc.type, isActive: true }, data: { isActive: false } });
    const updated = await prisma.complianceDoc.update({
      where: { id: req.params.id }, data: { isActive: true, publishedAt: new Date() }
    });
    await prisma.auditLog.create({
      data: { adminId: req.admin.id, action: 'COMPLIANCE_PUBLISH', resource: `${doc.type} v${doc.version}`, category: 'ADMIN' }
    });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/compliance/:id — remove a document version (only if not active)
router.delete('/:id', async (req, res) => {
  try {
    const doc = await prisma.complianceDoc.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado.' });
    if (doc.isActive) return res.status(400).json({ error: 'Não é possível excluir um documento ativo. Publique outra versão primeiro.' });
    // Also remove acceptance records linked to this doc
    await prisma.complianceAcceptance.deleteMany({ where: { docId: req.params.id } });
    await prisma.complianceDoc.delete({ where: { id: req.params.id } });
    await prisma.auditLog.create({
      data: { adminId: req.admin.id, action: 'COMPLIANCE_DELETE', resource: `${doc.type} v${doc.version}`, category: 'ADMIN' }
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

