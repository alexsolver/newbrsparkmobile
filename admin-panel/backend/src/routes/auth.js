'use strict';
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const prisma  = require('../db');
const { adminAuthThenPanel, attachAdminFromPayload } = require('../middleware/auth');
const { auditActor, auditContextMetadata } = require('../lib/auditActor');
const {
  buildPanelSessionBootstrap,
  buildAdminAuthorization,
  assertTenantAccess,
  hasCapability,
  normalizeRole,
} = require('../lib/authorization');

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
        metadata: auditContextMetadata(
          { authorization: buildAdminAuthorization({ panelUser: false, id: admin.id }) },
          { targetTenantId: null }
        ),
      },
    });

    const adminPayload = {
      panelUser: false,
      id: admin.id,
      userId: null,
      tenantId: null,
      email: admin.email,
      name: admin.name,
      role: null,
      tenantSlug: null,
      tenantName: null,
    };
    const session = buildPanelSessionBootstrap(adminPayload);
    res.json({
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name },
      mode: 'global',
      ...session,
    });
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

    const panelAdmin = {
      panelUser: true,
      id: null,
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
    };
    await prisma.auditLog.create({
      data: {
        adminId: null,
        userId: user.id,
        tenantId: user.tenantId,
        action: 'PANEL_TENANT_LOGIN',
        resource: user.email,
        category: 'AUTH',
        metadata: auditContextMetadata(
          { authorization: buildAdminAuthorization(panelAdmin) },
          { targetTenantId: user.tenantId, targetUserId: user.id }
        ),
      },
    });
    const session = buildPanelSessionBootstrap(panelAdmin);
    res.json({
      token,
      mode: 'tenant',
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, kind: tenant.kind || 'COMPANY' },
      ...session,
    });
  } catch (err) {
    console.error('[auth/tenant-login]', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
}

router.post('/tenant-login', postTenantLogin);

// POST /api/auth/impersonate-panel — { userId } — SAAS_ADMIN, admin global ou TENANT_ADMIN (mesmo tenant)
/**
 * POST /api/auth/panel-select-tenant
 * Admin de plataforma (JWT legado ou SAAS_ADMIN): filtra dados do painel a uma organização, ou «toda a plataforma».
 */
router.post('/panel-select-tenant', adminAuthThenPanel, async (req, res) => {
  try {
    if (!req.authorization?.isPlatform) {
      return res.status(403).json({
        error: 'Só administradores da plataforma podem definir o contexto de organização.',
      });
    }
    const hdr = req.headers.authorization || '';
    const bearer = hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : '';
    if (!bearer) return res.status(401).json({ error: 'Token ausente.' });

    let old;
    try {
      old = jwt.verify(bearer, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }

    const rawId = req.body?.tenantId;
    const clear =
      rawId === null ||
      rawId === undefined ||
      (typeof rawId === 'string' && rawId.trim() === '');

    let tenantRow = null;
    if (!clear) {
      const id = String(rawId).trim();
      tenantRow = await prisma.tenant.findUnique({
        where: { id },
        select: { id: true, slug: true, name: true, kind: true, status: true },
      });
      if (!tenantRow) return res.status(404).json({ error: 'Organização não encontrada.' });
    }

    const signOpts = { expiresIn: process.env.JWT_EXPIRES_IN || '8h' };
    let newPayload;

    if (old.panel === true && old.userId) {
      newPayload = {
        panel: true,
        userId: old.userId,
        tenantId: old.tenantId,
        email: old.email,
        name: old.name,
        role: old.role,
        tenantSlug: old.tenantSlug,
        tenantName: old.tenantName,
      };
      if (old.impersonation) {
        newPayload.impersonation = true;
        newPayload.impersonatorUserId = old.impersonatorUserId || null;
        newPayload.impersonatorEmail = old.impersonatorEmail || null;
        newPayload.impersonatorLegacyAdminId = old.impersonatorLegacyAdminId || null;
      }
      if (!clear && tenantRow) {
        newPayload.panelContextTenantId = tenantRow.id;
        newPayload.panelContextTenantSlug = tenantRow.slug;
        newPayload.panelContextTenantName = tenantRow.name;
        newPayload.panelContextTenantKind = tenantRow.kind || 'COMPANY';
      }
    } else if (old.panel === false && old.id) {
      newPayload = {
        panel: false,
        id: old.id,
        email: old.email,
        name: old.name,
      };
      if (!clear && tenantRow) {
        newPayload.panelContextTenantId = tenantRow.id;
        newPayload.panelContextTenantSlug = tenantRow.slug;
        newPayload.panelContextTenantName = tenantRow.name;
        newPayload.panelContextTenantKind = tenantRow.kind || 'COMPANY';
      }
    } else {
      return res.status(400).json({ error: 'Sessão incompatível com alteração de contexto.' });
    }

    const token = jwt.sign(newPayload, process.env.JWT_SECRET, signOpts);
    const sessionAdmin = attachAdminFromPayload(newPayload);
    const session = buildPanelSessionBootstrap(sessionAdmin);
    const tid = session.context?.tenantId || null;
    let tenantKind = 'COMPANY';
    if (tid) {
      const trow = await prisma.tenant.findUnique({ where: { id: String(tid) }, select: { kind: true } });
      if (trow?.kind) tenantKind = String(trow.kind);
    }

    if (sessionAdmin.panelUser) {
      return res.json({
        token,
        mode: tid ? 'tenant' : 'global',
        user: {
          id: sessionAdmin.userId,
          email: sessionAdmin.email,
          name: sessionAdmin.name,
          role: session.authz.roleKey,
        },
        ...(tid
          ? {
              tenant: {
                id: tid,
                slug: session.context?.tenantSlug || null,
                name: session.context?.tenantName || null,
                kind: tenantKind,
              },
            }
          : {}),
        ...session,
      });
    }

    const adminRow = await prisma.admin.findUnique({
      where: { id: sessionAdmin.id },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (!adminRow) return res.status(404).json({ error: 'Administrador não encontrado.' });

    return res.json({
      token,
      mode: tid ? 'tenant' : 'global',
      admin: adminRow,
      ...(tid
        ? {
            tenant: {
              id: tid,
              slug: session.context?.tenantSlug || null,
              name: session.context?.tenantName || null,
              kind: tenantKind,
            },
          }
        : {}),
      ...session,
    });
  } catch (err) {
    console.error('[auth/panel-select-tenant]', err);
    res.status(500).json({ error: err.message || 'Erro interno.' });
  }
});

router.post('/impersonate-panel', adminAuthThenPanel, async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId é obrigatório.' });
    }
    const actor = req.admin;
    if (!actor) return res.status(401).json({ error: 'Sessão inválida.' });

    const actorRole = normalizeRole(actor.role);
    if (actor.panelUser && actorRole === 'MANAGER') {
      return res.status(403).json({ error: 'O perfil Gestor não pode iniciar sessão como outro utilizador.' });
    }
    if (actor.panelUser && !hasCapability(req.authorization, 'platform.users.impersonate') && !req.authorization?.canImpersonate) {
      return res.status(403).json({ error: 'Sem permissão para impersonar.' });
    }

    const target = await prisma.user.findUnique({
      where: { id: String(userId).trim() },
      include: { tenant: true },
    });
    if (!target || !target.tenant) {
      return res.status(404).json({ error: 'Utilizador não encontrado.' });
    }
    if (!target.isActive) {
      return res.status(403).json({ error: 'Não é possível impersonar uma conta desativada.' });
    }
    if (!PANEL_TENANT_ROLES.has(target.role)) {
      return res.status(403).json({ error: 'Este utilizador não tem acesso ao painel (papel incompatível).' });
    }

    if (actor.panelUser && !assertTenantAccess(req.authorization, target.tenantId)) {
      return res.status(403).json({ error: 'Só é possível impersonar utilizadores do seu tenant.' });
    }

    const token = jwt.sign(
      {
        panel: true,
        userId: target.id,
        tenantId: target.tenantId,
        email: target.email,
        name: target.name,
        role: target.role,
        tenantSlug: target.tenant.slug,
        tenantName: target.tenant.name,
        impersonation: true,
        impersonatorUserId: actor.panelUser ? actor.userId : null,
        impersonatorEmail: actor.email || null,
        impersonatorLegacyAdminId: actor.panelUser ? null : actor.id || null,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_IMPERSONATION_EXPIRES_IN || '30m' }
    );

    const _a = auditActor(req);
    await prisma.auditLog
      .create({
        data: {
          ..._a,
          tenantId: target.tenantId,
          action: 'PANEL_IMPERSONATE',
          resource: target.email,
          category: 'ADMIN',
          metadata: auditContextMetadata(req, {
            targetUserId: target.id,
            targetRole: target.role,
            targetTenantId: target.tenantId,
            impersonatorUserId: actor.panelUser ? actor.userId : null,
            impersonatorEmail: actor.email || null,
            impersonatorLegacyAdminId: actor.panelUser ? null : actor.id || null,
          }),
        },
      })
      .catch(() => {});

    const session = buildPanelSessionBootstrap({
      panelUser: true,
      id: null,
      userId: target.id,
      tenantId: target.tenantId,
      email: target.email,
      name: target.name,
      role: target.role,
      tenantSlug: target.tenant.slug,
      tenantName: target.tenant.name,
    });
    res.json({
      token,
      mode: 'tenant',
      user: { id: target.id, email: target.email, name: target.name, role: target.role },
      tenant: {
        id: target.tenant.id,
        slug: target.tenant.slug,
        name: target.tenant.name,
        kind: target.tenant.kind || 'COMPANY',
      },
      ...session,
    });
  } catch (err) {
    console.error('[auth/impersonate-panel]', err);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').adminAuth, async (req, res) => {
  try {
    if (req.admin.panelUser) {
      const session = buildPanelSessionBootstrap(req.admin);
      const tid = session.context?.tenantId || null;
      let tenantKind = 'COMPANY';
      if (tid) {
        const trow = await prisma.tenant.findUnique({ where: { id: String(tid) }, select: { kind: true } });
        if (trow?.kind) tenantKind = String(trow.kind);
      }
      const isGlobalPlatformPanel = !!req.authorization?.isPlatform && !tid;
      return res.json({
        mode: isGlobalPlatformPanel ? 'global' : 'tenant',
        user: {
          id: req.admin.userId,
          email: req.admin.email,
          name: req.admin.name,
          role: session.authz.roleKey,
        },
        ...(tid
          ? {
              tenant: {
                id: tid,
                slug: session.context?.tenantSlug || null,
                name: session.context?.tenantName || null,
                kind: tenantKind,
              },
            }
          : {}),
        ...session,
      });
    }
    const admin = await prisma.admin.findUnique({
      where: { id: req.admin.id },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (!admin) return res.status(404).json({ error: 'Administrador não encontrado.' });
    const session = buildPanelSessionBootstrap({
      panelUser: false,
      id: admin.id,
      userId: null,
      tenantId: null,
      email: admin.email,
      name: admin.name,
      role: null,
      tenantSlug: null,
      tenantName: null,
      panelContextTenantId: req.admin.panelContextTenantId || null,
      panelContextTenantSlug: req.admin.panelContextTenantSlug || null,
      panelContextTenantName: req.admin.panelContextTenantName || null,
      panelContextTenantKind: req.admin.panelContextTenantKind || null,
    });
    const tidLegacy = session.context?.tenantId || null;
    let kindLegacy = String(req.admin.panelContextTenantKind || 'COMPANY');
    if (tidLegacy) {
      const trow = await prisma.tenant.findUnique({ where: { id: String(tidLegacy) }, select: { kind: true } });
      if (trow?.kind) kindLegacy = String(trow.kind);
    }
    res.json({
      mode: tidLegacy ? 'tenant' : 'global',
      admin,
      ...(tidLegacy
        ? {
            tenant: {
              id: tidLegacy,
              slug: session.context?.tenantSlug || null,
              name: session.context?.tenantName || null,
              kind: kindLegacy,
            },
          }
        : {}),
      ...session,
    });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

router.postTenantLogin = postTenantLogin;
module.exports = router;
