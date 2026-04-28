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
  hasCapability,
  isPlatformAdmin,
  resolveScopedTenantId,
} = require('../lib/authorization');
const { ensureHttpsUrlForPublicInternet } = require('../lib/publicHttpsUrl');
const { resolveMergedProviderIdentityForUserId, normalizeEmail } = require('../lib/providerIdentityMerge');
const { resolveCanonicalEmailNormForUser } = require('../lib/userEmailUnique');

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

function normalizeTenantSlug(raw) {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function slugFromTenantName(name) {
  let slug = normalizeTenantSlug(name);
  if (!slug) slug = `tenant-${Date.now()}`;
  return slug;
}

// GET /api/tenants
router.get('/', async (req, res) => {
  try {
    const { status, plan, q, page = 1, limit = 50 } = req.query;
    /** Lista completa para o seletor de contexto (sidebar) — só admin de plataforma. */
    const listAll =
      isPlatformAdmin(req.authorization) && String(req.query.all || '').trim() === '1';
    const scopedTenantId = listAll ? null : resolveScopedTenantId(req.authorization);
    const where = {
      ...(status && { status }),
      ...(q && { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] }),
      ...(plan && { subscription: { plan: { name: plan } } }),
      ...(scopedTenantId ? { id: scopedTenantId } : {}),
    };
    /** Com `all=1` (seletor do painel): por defeito só tenants empresa; `kind=ALL|CLIENT|PROVIDER` para filtrar. */
    if (listAll) {
      const kindStr = String(req.query.kind ?? '')
        .trim()
        .toUpperCase();
      if (!kindStr || kindStr === 'COMPANY') {
        where.kind = 'COMPANY';
      } else if (kindStr === 'ALL') {
        /* sem filtro por tipo */
      } else if (kindStr === 'CLIENT' || kindStr === 'PROVIDER') {
        where.kind = kindStr;
      } else {
        where.kind = 'COMPANY';
      }
    }
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
        kind: tenant.kind || 'COMPANY',
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
    if (!hasCapability(req.authorization, 'platform.tenants.write')) {
      return res.status(403).json({
        error:
          'Sem permissão para criar tenants. Use conta da plataforma (admin global ou SaaS admin) com permissão «platform.tenants.write».',
      });
    }
    const { name, email, defaultLang = 'pt-BR', planId, localeId, kind: bodyKind, slug: bodySlug } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
    const slugInput = bodySlug != null ? String(bodySlug).trim() : '';
    let slug;
    if (slugInput) {
      slug = normalizeTenantSlug(slugInput);
      if (!slug) {
        return res.status(400).json({
          error: 'Slug inválido. Use apenas letras minúsculas, números e hífens.',
        });
      }
    } else {
      slug = slugFromTenantName(name);
    }
    const baseSlug = slug.slice(0, 56);
    const ownerName = String(name).trim().slice(0, 200) || String(email).split('@')[0] || 'Admin';
    const kindRaw = String(bodyKind || 'COMPANY').trim().toUpperCase();
    const kind = ['COMPANY', 'CLIENT', 'PROVIDER'].includes(kindRaw) ? kindRaw : 'COMPANY';

    const localeIdNorm = localeId ? String(localeId).trim() : '';
    if (localeIdNorm) {
      const loc = await prisma.localeProfile.findFirst({
        where: { id: localeIdNorm, isActive: true },
        select: { id: true },
      });
      if (!loc) {
        return res.status(400).json({
          error:
            'Região/país inválido ou inativo. Atualize a página (F5), escolha de novo a região e tente criar o tenant.',
        });
      }
    }

    const emailNorm = String(email).trim().toLowerCase();
    const nameNorm = String(name).trim();

    const existingEmail = await prisma.tenant.findFirst({
      where: { email: emailNorm },
      select: { slug: true },
    });
    if (existingEmail) {
      return res.status(409).json({
        error: `Já existe um tenant com o e-mail «${emailNorm}» (organização: «${existingEmail.slug}»). Cada tenant precisa de um e-mail de administrador único — use outro e-mail.`,
      });
    }

    let tenant;
    let lastErr;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const slugTry = attempt === 0 ? slug.slice(0, 60) : `${baseSlug}-${attempt}`.slice(0, 60);
      try {
        tenant = await prisma.tenant.create({
          data: {
            name: nameNorm,
            slug: slugTry,
            email: emailNorm,
            ownerName,
            defaultLang,
            localeId: localeIdNorm || null,
            status: 'TRIAL',
            kind,
          },
        });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (e && e.code === 'P2002') {
          const rawT = e.meta?.target;
          const fields = Array.isArray(rawT) ? rawT.map(String) : rawT != null ? [String(rawT)] : [];
          if (fields.some((f) => f.includes('email'))) {
            throw e;
          }
          if (attempt < 7) continue;
        }
        throw e;
      }
    }
    if (!tenant) throw lastErr || new Error('Falha ao criar tenant.');

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
  } catch (err) {
    const code = err && err.code;
    if (code === 'P2002') {
      const rawT = err.meta?.target;
      const fields = Array.isArray(rawT) ? rawT.map(String) : rawT != null ? [String(rawT)] : [];
      let msg =
        'Já existe um registo com estes dados. Verifique e-mail (único por tenant) ou slug (único).';
      if (fields.some((f) => f.includes('email'))) {
        msg =
          'Este e-mail já está a ser usado por outro tenant. O e-mail do administrador tem de ser único em toda a plataforma — escolha outro.';
      } else if (fields.some((f) => f.includes('slug'))) {
        msg =
          'Este slug já está em uso. Altere o campo «Slug do domínio» ou o nome da empresa até o sistema aceitar.';
      }
      return res.status(409).json({ error: msg });
    }
    console.error('[POST /tenants]', err);
    res.status(500).json({ error: err.message || 'Falha ao criar tenant.' });
  }
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
    const { name, email, phone, taxId, defaultLang, localeId, kind: bodyKind } = req.body;
    const kindRaw = bodyKind != null ? String(bodyKind).trim().toUpperCase() : null;
    const kind =
      kindRaw && ['COMPANY', 'CLIENT', 'PROVIDER'].includes(kindRaw) ? kindRaw : undefined;
    const data = { name, email, phone, taxId, defaultLang, localeId };
    if (isPlatformAdmin(req.authorization) && kind) data.kind = kind;
    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data,
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
      'loginPageLogoUrl',
      'loginBackgroundColor',
      'appHeaderBackgroundColor',
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
              select: {
                id: true,
                email: true,
                name: true,
                avatarUrl: true,
                phone: true,
                appAccountId: true,
                appAccount: { select: { emailNorm: true } },
              },
            },
          },
        },
      },
    });
    const userIds = [
      ...new Set(rows.map((r) => r.providerIdentity?.user?.id).filter(Boolean).map((id) => String(id))),
    ];
    const mergedKycByUserId = new Map();
    await Promise.all(
      userIds.map(async (uid) => {
        const first = rows.find((r) => r.providerIdentity?.user?.id && String(r.providerIdentity.user.id) === uid);
        const email = first?.providerIdentity?.user?.email || '';
        const merged = await resolveMergedProviderIdentityForUserId(prisma, uid, normalizeEmail(email));
        mergedKycByUserId.set(uid, String(merged?.kycStatus || '').toUpperCase().trim());
      }),
    );
    const activationKycOkForRow = (row) => {
      const line = String(row.providerIdentity?.kycStatus || '')
        .toUpperCase()
        .trim();
      if (line === 'REJECTED') return false;
      const uid = String(row.providerIdentity?.user?.id || '');
      const m = mergedKycByUserId.get(uid) || '';
      return line === 'APPROVED' || m === 'APPROVED';
    };
    const loginNormCache = new Map();
    async function loginNormForUser(u) {
      if (!u?.id) return '';
      const id = String(u.id);
      if (loginNormCache.has(id)) return loginNormCache.get(id);
      const v = (await resolveCanonicalEmailNormForUser(prisma, u)) || '';
      loginNormCache.set(id, v);
      return v;
    }
    const data = await Promise.all(
      rows.map(async (row) => {
        const u = row.providerIdentity.user;
        const loginEmailNorm = u ? await loginNormForUser(u) : '';
        return {
          id: row.id,
          status: row.status,
          relationshipType: row.relationshipType || 'PARTNER',
          note: row.note,
          invitedAt: row.invitedAt,
          requestedAt: row.requestedAt,
          activatedAt: row.activatedAt,
          activationKycOk: activationKycOkForRow(row),
          providerIdentity: {
            id: row.providerIdentity.id,
            globalStatus: row.providerIdentity.globalStatus,
            kycStatus: row.providerIdentity.kycStatus,
            score: row.providerIdentity.score,
            cft: row.providerIdentity.cft,
            specialty: row.providerIdentity.specialty,
            user: u
              ? {
                  id: u.id,
                  email: u.email,
                  name: u.name,
                  avatarUrl: ensureHttpsUrlForPublicInternet(u.avatarUrl),
                  phone: u.phone,
                  loginEmailNorm: loginEmailNorm || null,
                }
              : null,
          },
        };
      }),
    );
    return res.json({
      data,
      total: rows.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
