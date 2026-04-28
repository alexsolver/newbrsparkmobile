'use strict';

const crypto = require('crypto');
const express = require('express');
const prisma = require('../db');
const { isProviderFirstNetworkEnabled } = require('../lib/providerFirstNetwork');
const { escapeHtmlEmailFragment } = require('../lib/emailEscapeHtml');
const { sendTransactionalEmailWithFallback } = require('../lib/transactionalEmailSend');
const { resolveCanonicalEmailNormForUser } = require('../lib/userEmailUnique');
const { sendExpoPushToMany } = require('../services/expoPush');
const { isHiddenFromPublicDirectoryAt } = require('../lib/providerDedicatedExclusiveService');

const AFFILIATION_ACCEPT_BASE_URL =
  String(process.env.PROVIDER_AFFILIATION_ACCEPT_URL_BASE || 'brsparkmobile://provider-affiliation/accept').trim();

const router = express.Router();

function timingSafeEqual(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function requireBridge(req, res) {
  const expected = process.env.BRSPARK_WEB_BRIDGE_SECRET;
  if (!expected || !timingSafeEqual(req.headers['x-bridge-secret'], expected)) {
    res.status(401).json({ error: 'Não autorizado.' });
    return false;
  }
  return true;
}

async function ensureProviderFirstEnabledOr403(res, tenantId) {
  const enabled = await isProviderFirstNetworkEnabled(String(tenantId));
  if (!enabled) {
    res.status(403).json({
      error: 'Fluxo provider-first desativado para este tenant.',
      code: 'PROVIDER_FIRST_DISABLED',
    });
    return false;
  }
  return true;
}

function normalizeEmail(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function slugifyDomain(domain) {
  let s = String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
  const parts = s.split('.');
  s = parts[0] || s;
  s = s.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return (s || 'tenant').slice(0, 48);
}

async function tenantUserEmailsLower(tenantId) {
  const rows = await prisma.user.findMany({
    where: { tenantId },
    select: { email: true },
  });
  return rows.map((r) => String(r.email || '').trim().toLowerCase()).filter(Boolean);
}

async function executionScopeWhere(tenantId) {
  const emailsLower = await tenantUserEmailsLower(tenantId);
  /** @type {import('@prisma/client').Prisma.ChecklistExecutionWhereInput['OR']} */
  const scopeOr = [{ template: { is: { tenantId } } }];
  if (emailsLower.length) {
    scopeOr.push({
      AND: [{ template: { is: { tenantId: null } } }, { ownerEmail: { in: emailsLower, mode: 'insensitive' } }],
    });
  }
  return { OR: scopeOr };
}

/**
 * POST /api/internal/cms-tenant-provision
 * Laravel (SaaS) provisiona tenant COMPANY no PostgreSQL, idempotente por laravelTenantId.
 */
router.post('/cms-tenant-provision', express.json({ limit: '128kb' }), async (req, res) => {
  try {
    if (!requireBridge(req, res)) return;
    const laravelTenantId = String(req.body.laravelTenantId || '').trim();
    const name = String(req.body.name || 'Empresa').trim().slice(0, 200);
    const domainSlug = String(req.body.domainSlug || '').trim();
    if (!laravelTenantId || laravelTenantId.length < 8) {
      return res.status(400).json({ error: 'laravelTenantId inválido.' });
    }

    const existing = await prisma.tenant.findFirst({
      where: { laravelTenantId },
    });
    if (existing) {
      return res.json({
        ok: true,
        created: false,
        nodeTenantId: existing.id,
        slug: existing.slug,
      });
    }

    let baseSlug = slugifyDomain(domainSlug || name);
    let slug = baseSlug;
    let attempt = 0;
    const syntheticEmail = () =>
      `cms+${laravelTenantId.replace(/-/g, '').slice(0, 12)}-${attempt || '0'}@brspark.cms.linked`;

    while (attempt < 20) {
      const email = syntheticEmail();
      try {
        const row = await prisma.tenant.create({
          data: {
            name,
            slug,
            email,
            ownerName: name,
            kind: 'COMPANY',
            laravelTenantId,
            status: 'TRIAL',
          },
        });
        return res.status(201).json({
          ok: true,
          created: true,
          nodeTenantId: row.id,
          slug: row.slug,
        });
      } catch (e) {
        const code = e && e.code;
        if (code === 'P2002') {
          attempt += 1;
          slug = `${baseSlug}-${attempt}`.slice(0, 60);
          continue;
        }
        throw e;
      }
    }
    return res.status(409).json({ error: 'Não foi possível gerar slug único.' });
  } catch (err) {
    console.error('[cms-tenant-provision]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/internal/cms-directory-providers-snapshot
 * Laravel puxa snapshot de prestadores (cross-tenant) para alimentar o diretório público.
 * Protegido por X-Bridge-Secret (mesmo segredo do provisionamento).
 *
 * Retorna:
 *  { ok: true, providers: [{ userId, email, name, role, phone, city? }] }
 *  Sem `tenant` na resposta: o vínculo prestador↔empresa não é exposto em buscas públicas.
 */
router.post('/cms-directory-providers-snapshot', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    if (!requireBridge(req, res)) return;
    const at = new Date();
    const rows = await prisma.user.findMany({
      where: {
        isActive: true,
        // Diretório público: SOMENTE prestadores reais (provider-first), nunca tenants CLIENT.
        role: 'PROVIDER',
        tenant: {
          is: {
            kind: 'COMPANY',
            status: { notIn: ['SUSPENDED', 'CANCELLED'] },
          },
        },
      },
      include: {
        tenant: { select: { id: true, slug: true, name: true, status: true, kind: true } },
        technicianProfile: true,
        appAccount: { select: { emailNorm: true } },
        providerIdentity: {
          select: {
            affiliations: {
              where: { status: 'ACTIVE', relationshipType: 'DEDICATED' },
              select: { status: true, relationshipType: true, tenantScheduleJson: true },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
      take: 5000,
    });

    const visibleRows = rows.filter((u) => !isHiddenFromPublicDirectoryAt(u.providerIdentity, at));

    const providers = await Promise.all(
      visibleRows.map(async (u) => ({
        userId: u.id,
        email: (await resolveCanonicalEmailNormForUser(prisma, u)) || u.email,
        name: u.name,
        role: u.role,
        phone: u.phone || null,
        city: u.technicianProfile?.city || null,
      })),
    );

    return res.json({ ok: true, providers });
  } catch (err) {
    console.error('[cms-directory-providers-snapshot]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/internal/cms-directory-resolve-provider-tenant
 * Resolve o tenant Node (empresa) onde o utilizador prestador está listado — só servidor Laravel (bridge).
 */
router.post('/cms-directory-resolve-provider-tenant', express.json({ limit: '16kb' }), async (req, res) => {
  try {
    if (!requireBridge(req, res)) return;
    const userId = String(req.body?.userId || '').trim();
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório.' });
    const u = await prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        role: 'PROVIDER',
        tenant: {
          is: {
            kind: 'COMPANY',
            status: { notIn: ['SUSPENDED', 'CANCELLED'] },
          },
        },
      },
      select: { tenantId: true },
    });
    if (!u?.tenantId) return res.status(404).json({ error: 'Prestador não encontrado.' });
    return res.json({ ok: true, nodeTenantId: String(u.tenantId) });
  } catch (err) {
    console.error('[cms-directory-resolve-provider-tenant]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/internal/cms-operational-summary
 * Resumo de OS/técnicos para o painel empresa no Laravel.
 */
router.post('/cms-operational-summary', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    if (!requireBridge(req, res)) return;
    const laravelTenantId = String(req.body.laravelTenantId || '').trim();
    if (!laravelTenantId) {
      return res.status(400).json({ error: 'laravelTenantId é obrigatório.' });
    }
    const tenant = await prisma.tenant.findFirst({
      where: { laravelTenantId },
    });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant Node não encontrado para este laravelTenantId.' });
    }
    const tenantId = tenant.id;
    const scope = await executionScopeWhere(tenantId);
    const terminal = ['COMPLETED', 'SYNCED', 'CANCELLED'];

    const [
      technicianCount,
      managerCount,
      executionsTotal,
      openFieldTasks,
      recentExecutions,
    ] = await Promise.all([
      prisma.user.count({ where: { tenantId, role: 'PROVIDER' } }),
      prisma.user.count({ where: { tenantId, role: 'MANAGER' } }),
      prisma.checklistExecution.count({ where: scope }),
      prisma.checklistExecution.count({
        where: {
          AND: [scope, { osNumber: { not: null } }, { NOT: { status: { in: terminal } } }],
        },
      }),
      prisma.checklistExecution.findMany({
        where: scope,
        orderBy: [{ updatedAt: 'desc' }],
        take: 30,
        select: {
          id: true,
          osNumber: true,
          routineTaskNumber: true,
          status: true,
          ownerEmail: true,
          assignmentMode: true,
          claimStatus: true,
          createdAt: true,
          completedAt: true,
          template: { select: { id: true, title: true } },
        },
      }),
    ]);

    res.json({
      ok: true,
      nodeTenantId: tenantId,
      laravelTenantId: tenant.laravelTenantId,
      counts: {
        technicians: technicianCount,
        managers: managerCount,
        checklistExecutions: executionsTotal,
        openFieldTasks,
      },
      recentExecutions,
    });
  } catch (err) {
    console.error('[cms-operational-summary]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/internal/provider-affiliations/invite
 * Laravel cria convite de parceria (provider-first) para aparecer no app do prestador.
 *
 * Body: { tenantId, email, relationshipType?, note?, pushTitle?, pushBody? }
 */
router.post('/provider-affiliations/invite', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    if (!requireBridge(req, res)) return;
    const email = normalizeEmail(req.body?.email);
    const tenantId = String(req.body?.tenantId || '').trim();
    if (!email) return res.status(400).json({ error: 'email é obrigatório.' });
    if (!tenantId) return res.status(400).json({ error: 'tenantId é obrigatório.' });
    if (!(await ensureProviderFirstEnabledOr403(res, tenantId))) return;

    let providers = await prisma.providerIdentity.findMany({
      where: {
        user: {
          email: {
            equals: email,
            mode: 'insensitive',
          },
        },
      },
      include: { user: { select: { id: true, email: true, name: true, appAccountId: true } } },
      take: 3,
    });
    if (!providers.length) {
      const acc = await prisma.appAccount.findUnique({ where: { emailNorm: email }, select: { id: true } });
      if (acc) {
        providers = await prisma.providerIdentity.findMany({
          where: { user: { appAccountId: acc.id } },
          include: { user: { select: { id: true, email: true, name: true, appAccountId: true } } },
          take: 3,
        });
      }
    }
    if (!providers.length) {
      return res.status(404).json({
        error: 'Prestador ainda não possui cadastro global concluído.',
        code: 'PROVIDER_NOT_FOUND',
      });
    }
    if (providers.length > 1) {
      return res.status(409).json({
        error: 'Mais de uma conta global encontrada para este e-mail.',
        code: 'PROVIDER_IDENTITY_AMBIGUOUS',
      });
    }
    const provider = providers[0];
    const pushUserIds = provider.user.appAccountId
      ? (
          await prisma.user.findMany({
            where: { appAccountId: String(provider.user.appAccountId) },
            select: { id: true },
          })
        ).map((u) => u.id)
      : [String(provider.userId)];
    const emailTo = provider.user.appAccountId
      ? (await prisma.appAccount.findUnique({
            where: { id: String(provider.user.appAccountId) },
            select: { emailNorm: true },
          }))?.emailNorm || provider.user.email
      : provider.user.email;

    const relationshipType = 'DEDICATED';
    const note = String(req.body?.note || '').trim();
    const invitationToken = crypto.randomBytes(24).toString('hex');
    const now = new Date();

    const row = await prisma.providerTenantAffiliation.upsert({
      where: {
        tenantId_providerIdentityId: {
          tenantId: String(tenantId),
          providerIdentityId: provider.id,
        },
      },
      create: {
        tenantId: String(tenantId),
        providerIdentityId: provider.id,
        status: 'INVITED',
        relationshipType,
        invitationToken,
        invitedAt: now,
        note: note || null,
        invitedByUserId: null,
      },
      update: {
        status: 'INVITED',
        relationshipType,
        invitationToken,
        invitedAt: now,
        note: note || null,
        invitedByUserId: null,
      },
    });

    const acceptUrl = `${AFFILIATION_ACCEPT_BASE_URL}${AFFILIATION_ACCEPT_BASE_URL.includes('?') ? '&' : '?'}token=${encodeURIComponent(invitationToken)}`;
    const tenantLabelRow = await prisma.tenant
      .findUnique({
        where: { id: String(tenantId) },
        select: { name: true, slug: true },
      })
      .catch(() => null);
    const tenantLabel = String(tenantLabelRow?.name || tenantLabelRow?.slug || tenantId).trim() || 'Empresa';
    const relPt = 'vínculo dedicado (full time)';

    const notify = {
      emailSent: false,
      emailSkipped: false,
      emailError: null,
      emailProvider: null,
      emailSkippedReason: null,
      pushSent: 0,
      pushErrors: 0,
      pushTokenCount: 0,
      pushFirstError: null,
    };

    try {
      const subject = `Convite BrSpark — ${tenantLabel}`;
      const text = `Olá,\n\nA empresa «${tenantLabel}» convidou-o para ${relPt} na rede BrSpark.\n\nAbra o link no telemóvel com a app BrSpark instalada:\n${acceptUrl}\n\nNo app: Perfil → Organizações e parcerias.\n`;
      const html = `<p>Olá,</p><p>A empresa <strong>${escapeHtmlEmailFragment(tenantLabel)}</strong> convidou-o para <strong>${escapeHtmlEmailFragment(relPt)}</strong> na rede BrSpark.</p><p><a href="${escapeHtmlEmailFragment(acceptUrl)}">Abrir no app / aceitar convite</a></p>`;
      const { send, provider: emailProviderUsed } = await sendTransactionalEmailWithFallback({
        to: emailTo,
        subject,
        html,
        text,
      });
      notify.emailSent = !!send?.ok;
      notify.emailSkipped = !!send?.skipped;
      notify.emailProvider = emailProviderUsed || null;
      if (send?.reason) notify.emailSkippedReason = String(send.reason).slice(0, 500);
      if (!send?.ok && send?.error) notify.emailError = String(send.error).slice(0, 240);
      else if (!send?.ok && send?.skipped && send?.reason && !notify.emailError) {
        notify.emailError = String(send.reason).slice(0, 240);
      }
    } catch (e) {
      console.error('[internal/provider-affiliations/invite] e-mail:', e?.message || e);
      notify.emailError = String(e?.message || e).slice(0, 240);
    }

    const pushTitle = String(req.body?.pushTitle || 'Convite — organizações e parcerias').trim() || 'Convite — organizações e parcerias';
    const pushBody =
      String(req.body?.pushBody || `${tenantLabel}: novo convite. Abra a app.`).trim() ||
      `${tenantLabel}: novo convite. Abra a app.`;
    const tokens = await prisma.pushToken.findMany({ where: { userId: { in: pushUserIds } } });
    notify.pushTokenCount = tokens.length;
    if (tokens.length) {
      try {
        const pushRes = await sendExpoPushToMany(tokens, {
          channelId: 'brspark-tecnico',
          title: pushTitle,
          body: pushBody,
          data: {
            type: 'PROVIDER_AFFILIATION_INVITED',
            tenantId: String(tenantId),
            affiliationId: row.id,
            acceptUrl,
          },
        });
        notify.pushSent = Number(pushRes?.sent) || 0;
        notify.pushErrors = Number(pushRes?.errors) || 0;
        const bad = (pushRes.tickets || []).find((x) => x && x.status === 'error');
        if (bad) notify.pushFirstError = String(bad.message || 'erro Expo').slice(0, 200);
      } catch (err) {
        console.error('[internal/provider-affiliations/invite] Expo push falhou:', err?.message || err);
      }
    }

    return res.status(201).json({
      ok: true,
      affiliationId: row.id,
      providerIdentityId: provider.id,
      email: emailTo,
      acceptUrl,
      status: row.status,
      relationshipType: row.relationshipType || relationshipType,
      invitedAt: row.invitedAt,
      notify,
    });
  } catch (err) {
    console.error('[internal/provider-affiliations/invite]', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
