'use strict';
const router = require('express').Router();
const prisma = require('../db');
const { auditActor, auditContextMetadata } = require('../lib/auditActor');
const {
  brandingValidationIssues,
  buildEffectiveTenantBranding,
  mergeTenantFeaturesWithBranding,
  sanitizeTenantBranding,
} = require('../lib/tenantBranding');
const { isProviderFirstNetworkEnabled } = require('../lib/providerFirstNetwork');
const { isGlobalAppTenantEntity } = require('../lib/mobileTenantBranding');
const {
  assertTenantAccess,
  isPlatformAdmin,
  resolveScopedTenantId,
} = require('../lib/authorization');
const { ensureHttpsUrlForPublicInternet } = require('../lib/publicHttpsUrl');

function auditFromReq(req, action, resource, tenantId = null, metadata = undefined) {
  const { adminId, userId } = auditActor(req);
  return prisma.auditLog.create({
    data: {
      adminId,
      userId,
      action,
      resource,
      category: 'ADMIN',
      tenantId,
      metadata: auditContextMetadata(req, { targetTenantId: tenantId, ...(metadata || {}) }),
    },
  });
}

function requireTenantRouteAccess(req, tenantId, res) {
  if (assertTenantAccess(req.authorization, tenantId)) return true;
  res.status(403).json({ error: 'Sem permissão para este tenant.' });
  return false;
}

// GET /api/tenants
router.get('/', async (req, res) => {
  try {
    const { status, plan, q, page = 1, limit = 50 } = req.query;
    const scopedTenantId = resolveScopedTenantId(req.authorization);
    const where = {
      ...(status && { status }),
      ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] }),
      ...(plan && { subscription: { plan: { name: plan } } }),
      ...(scopedTenantId ? { id: scopedTenantId } : {}),
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
    if (!requireTenantRouteAccess(req, req.params.id, res)) return;
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

// GET /api/tenants/:id/branding
router.get('/:id/branding', async (req, res) => {
  try {
    if (!requireTenantRouteAccess(req, req.params.id, res)) return;
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: {
        subscription: { include: { plan: true } },
      },
    });
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado.' });
    const branding = buildEffectiveTenantBranding({
      tenantName: tenant.name,
      planFeatures: tenant.subscription?.plan?.features,
      tenantFeatures: tenant.features,
    });
    const isGlobalAppTenant = isGlobalAppTenantEntity(tenant);
    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        planName: tenant.subscription?.plan?.name || null,
        isGlobalAppTenant,
      },
      permissions: branding.permissions,
      branding: branding.saved,
      effectiveBranding: branding.effective,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tenants
router.post('/', async (req, res) => {
  try {
    if (!isPlatformAdmin(req.authorization)) {
      return res.status(403).json({ error: 'Apenas a plataforma pode criar tenants.' });
    }
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

    await auditFromReq(req, 'TENANT_CREATE', tenant.name);
    res.status(201).json(tenant);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/tenants/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    if (!isPlatformAdmin(req.authorization)) {
      return res.status(403).json({ error: 'Apenas a plataforma pode alterar o status de tenants.' });
    }
    const { status } = req.body;
    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: { status } });
    await auditFromReq(req, `TENANT_${status}`, tenant.name, tenant.id);
    res.json(tenant);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/tenants/:id
router.put('/:id', async (req, res) => {
  try {
    if (!requireTenantRouteAccess(req, req.params.id, res)) return;
    const { name, email, phone, taxId, defaultLang, localeId } = req.body;
    const tenant = await prisma.tenant.update({ 
      where: { id: req.params.id }, 
      data: { name, email, phone, taxId, defaultLang, localeId } 
    });
    await auditFromReq(req, 'TENANT_UPDATE', tenant.name, tenant.id);
    res.json(tenant);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/tenants/:id/branding
router.put('/:id/branding', async (req, res) => {
  try {
    if (!requireTenantRouteAccess(req, req.params.id, res)) return;
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: {
        subscription: { include: { plan: true } },
      },
    });
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado.' });
    const resolved = buildEffectiveTenantBranding({
      tenantName: tenant.name,
      planFeatures: tenant.subscription?.plan?.features,
      tenantFeatures: tenant.features,
    });
    const isGlobalAppTenant = isGlobalAppTenantEntity(tenant);
    const prevSaved = resolved.saved;
    const sanitized = sanitizeTenantBranding(req.body?.branding, resolved.permissions);
    if (!isGlobalAppTenant) {
      sanitized.liveActivityBadgeKey = prevSaved.liveActivityBadgeKey || '';
    }
    const changedRestrictedBrandingKeys = [
      'enabled',
      'appDisplayName',
      'tagline',
      'primaryColor',
      'accentColor',
      'secondaryColor',
      'surfaceColor',
      'logoLightUrl',
      'logoDarkUrl',
      'loginBackgroundUrl',
    ].some((k) => JSON.stringify(prevSaved?.[k]) !== JSON.stringify(sanitized?.[k]));
    if (!resolved.permissions.enabled && changedRestrictedBrandingKeys) {
      return res.status(403).json({
        error: 'O plano atual deste tenant não permite branding do app móvel.',
      });
    }
    const issues = brandingValidationIssues(sanitized, resolved.permissions);
    if (issues.length) {
      return res.status(400).json({
        error: issues[0],
        issues,
      });
    }
    const nextBranding = {
      ...prevSaved,
      ...sanitized,
      brandingVersion: (Number(prevSaved.brandingVersion) || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    const updated = await prisma.tenant.update({
      where: { id: req.params.id },
      data: {
        features: mergeTenantFeaturesWithBranding(tenant.features, nextBranding),
      },
      include: {
        subscription: { include: { plan: true } },
      },
    });
    const out = buildEffectiveTenantBranding({
      tenantName: updated.name,
      planFeatures: updated.subscription?.plan?.features,
      tenantFeatures: updated.features,
    });
    const changedKeys = Object.keys(nextBranding).filter(
      (k) => JSON.stringify(prevSaved?.[k]) !== JSON.stringify(nextBranding?.[k]),
    );
    await auditFromReq(req, 'TENANT_BRANDING_UPDATE', updated.name, updated.id, {
      changedKeys,
      brandingVersionBefore: Number(prevSaved.brandingVersion) || 0,
      brandingVersionAfter: Number(nextBranding.brandingVersion) || 0,
      enabled: !!nextBranding.enabled,
    });
    res.json({
      ok: true,
      permissions: out.permissions,
      branding: out.saved,
      effectiveBranding: out.effective,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/tenants/:id/features — merge em `Tenant.features` (objeto JSON).
 * Ex.: { "features": { "googleMaps": { "monthlyRouteRequestsMax": 2000 } } } aperta o teto mensal de rotas Google (além do plano).
 */
router.patch('/:id/features', async (req, res) => {
  try {
    if (!isPlatformAdmin(req.authorization)) {
      return res.status(403).json({ error: 'Apenas a plataforma pode alterar features de tenant.' });
    }
    const patch = req.body?.features;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'Envie JSON { features: { ... } } com objeto em «features».' });
    }
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      select: { features: true },
    });
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado.' });
    const cur =
      tenant.features && typeof tenant.features === 'object' && !Array.isArray(tenant.features)
        ? tenant.features
        : {};
    const next = { ...cur };
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      if (
        v != null &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        next[k] &&
        typeof next[k] === 'object' &&
        !Array.isArray(next[k])
      ) {
        next[k] = { ...next[k], ...v };
      } else {
        next[k] = v;
      }
    }
    const updated = await prisma.tenant.update({
      where: { id: req.params.id },
      data: { features: next },
    });
    await auditFromReq(req, 'TENANT_FEATURES_PATCH', updated.name || updated.id, updated.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tenants/:id/providers — lista parceiros provider-first por status
router.get('/:id/providers', async (req, res) => {
  try {
    const tenantId = String(req.params.id || '').trim();
    if (!requireTenantRouteAccess(req, tenantId, res)) return;
    const enabled = await isProviderFirstNetworkEnabled(tenantId);
    if (!enabled) {
      return res.status(403).json({
        error: 'Fluxo provider-first desativado para este tenant.',
        code: 'PROVIDER_FIRST_DISABLED',
      });
    }
    const status = String(req.query?.status || '').trim().toUpperCase();
    const where = {
      tenantId,
      ...(status ? { status } : {}),
    };
    const rows = await prisma.providerTenantAffiliation.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        providerIdentity: {
          include: {
            user: {
              select: { id: true, email: true, name: true, avatarUrl: true, phone: true },
            },
          },
        },
      },
    });
    return res.json({
      data: rows.map((row) => ({
        id: row.id,
        status: row.status,
        note: row.note,
        invitedAt: row.invitedAt,
        requestedAt: row.requestedAt,
        activatedAt: row.activatedAt,
        providerIdentity: {
          id: row.providerIdentity.id,
          globalStatus: row.providerIdentity.globalStatus,
          kycStatus: row.providerIdentity.kycStatus,
          score: row.providerIdentity.score,
          cft: row.providerIdentity.cft,
          specialty: row.providerIdentity.specialty,
          user: row.providerIdentity.user
            ? {
                ...row.providerIdentity.user,
                avatarUrl: ensureHttpsUrlForPublicInternet(row.providerIdentity.user.avatarUrl),
              }
            : null,
        },
      })),
      total: rows.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
