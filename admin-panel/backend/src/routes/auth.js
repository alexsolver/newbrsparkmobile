'use strict';
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const prisma  = require('../db');

const PANEL_TENANT_ROLES = new Set(['SAAS_ADMIN', 'TENANT_ADMIN', 'MANAGER']);

// POST /api/auth/login — conta Admin legada (equipe da plataforma, sem tenant)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!admin) return res.status(401).json({ error: 'Credenciais inválidas.' });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas.' });

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        panel: false,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    await prisma.auditLog.create({
      data: {
        adminId: admin.id,
        userId: null,
        action: 'LOGIN',
        resource: 'Admin Console',
        category: 'AUTH',
      },
    });

    res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name }, mode: 'global' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// POST /api/auth/tenant-login — e-mail + senha dentro de uma organização (slug do tenant)
// (também montado em POST /api/tenant-login em index.js para compatibilidade)
async function postTenantLogin(req, res) {
  try {
    const { tenantSlug, email, password } = req.body;
    if (!tenantSlug || !email || !password) {
      return res.status(400).json({ error: 'Organização, e-mail e senha são obrigatórios.' });
    }

    const slugNorm = String(tenantSlug).trim().toLowerCase();
    const tenant = await prisma.tenant.findFirst({
      where: { slug: { equals: slugNorm, mode: 'insensitive' } },
    });
    if (!tenant) return res.status(401).json({ error: 'Organização não encontrada.' });

    if (tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
      return res.status(403).json({ error: 'Esta organização está suspensa ou cancelada.' });
    }

    const user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, email: email.toLowerCase().trim() },
    });
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas.' });
    if (!user.isActive) return res.status(403).json({ error: 'Conta desativada.' });

    if (!PANEL_TENANT_ROLES.has(user.role)) {
      return res.status(403).json({
        error: 'Este papel não tem acesso ao painel. Use um usuário SaaS admin ou admin do tenant.',
      });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas.' });

    const token = jwt.sign(
      {
        panel: true,
        userId: user.id,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    await prisma.auditLog.create({
      data: {
        adminId: null,
        userId: user.id,
        tenantId: user.tenantId,
        action: 'PANEL_TENANT_LOGIN',
        resource: user.email,
        category: 'AUTH',
      },
    });

    res.json({
      token,
      mode: 'tenant',
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    });
  } catch (err) {
    console.error('[auth/tenant-login]', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
}

router.post('/tenant-login', postTenantLogin);

// GET /api/auth/me
router.get('/me', require('../middleware/auth').adminAuth, async (req, res) => {
  try {
    if (req.admin.panelUser) {
      return res.json({
        mode: 'tenant',
        user: {
          id: req.admin.userId,
          email: req.admin.email,
          name: req.admin.name,
          role: req.admin.role,
        },
        tenant: {
          id: req.admin.tenantId,
          slug: req.admin.tenantSlug,
          name: req.admin.tenantName,
        },
      });
    }
    const admin = await prisma.admin.findUnique({
      where: { id: req.admin.id },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (!admin) return res.status(404).json({ error: 'Administrador não encontrado.' });
    res.json({ mode: 'global', admin });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

router.postTenantLogin = postTenantLogin;
module.exports = router;
