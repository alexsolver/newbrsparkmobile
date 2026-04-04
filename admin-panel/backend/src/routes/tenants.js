'use strict';
const router = require('express').Router();
const prisma = require('../db');

function auditLog(adminId, action, resource, tenantId = null) {
  return prisma.auditLog.create({ data: { adminId, action, resource, category: 'ADMIN', tenantId } });
}

// GET /api/tenants
router.get('/', async (req, res) => {
  try {
    const { status, plan, q, page = 1, limit = 50 } = req.query;
    const where = {
      ...(status && { status }),
      ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] }),
      ...(plan && { subscription: { plan: { name: plan } } }),
    };
    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where, skip: (page - 1) * limit, take: +limit,
        orderBy: { createdAt: 'desc' },
        include: { 
          locale: true,
          subscription: { include: { plan: true } }, 
          _count: { select: { users: true, assets: true } } 
        }
      }),
      prisma.tenant.count({ where }),
    ]);
    res.json({ data: tenants, total, page: +page });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/tenants/:id
router.get('/:id', async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: { 
        locale: true,
        subscription: { include: { plan: true, invoices: { orderBy: { createdAt: 'desc' }, take: 5 } } }, 
        _count: { select: { users: true, assets: true } } 
      }
    });
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado.' });
    res.json(tenant);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tenants
router.post('/', async (req, res) => {
  try {
    const { name, email, defaultLang = 'pt-BR', planId, localeId } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const tenant = await prisma.tenant.create({ data: { name, slug, email, defaultLang, localeId, status: 'TRIAL' } });

    if (planId) {
      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (plan) {
        const now = new Date();
        const end = new Date(now); end.setMonth(end.getMonth() + 1);
        await prisma.subscription.create({
          data: { tenantId: tenant.id, planId, status: 'TRIALING', currentStart: now, currentEnd: end, trialEndsAt: end }
        });
      }
    }

    await auditLog(req.admin.id, 'TENANT_CREATE', tenant.name);
    res.status(201).json(tenant);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/tenants/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: { status } });
    await auditLog(req.admin.id, `TENANT_${status}`, tenant.name, tenant.id);
    res.json(tenant);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/tenants/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, email, phone, taxId, defaultLang, localeId } = req.body;
    const tenant = await prisma.tenant.update({ 
      where: { id: req.params.id }, 
      data: { name, email, phone, taxId, defaultLang, localeId } 
    });
    await auditLog(req.admin.id, 'TENANT_UPDATE', tenant.name, tenant.id);
    res.json(tenant);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
