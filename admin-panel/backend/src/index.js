'use strict';
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');

const { adminAuthThenPanel } = require('./middleware/auth');
const prisma          = require('./db');
const { runBackfillOsNumbers } = require('./lib/backfillOsNumbersLib');
const { ensureChatLocaleSchema } = require('./lib/ensureChatLocaleSchema');
const { normalizeOsrmBaseUrl, DEFAULT_OSRM_BASE } = require('./lib/osrmBaseUrl');

// Routes
const authRoutes          = require('./routes/auth');       // admin login
const accountRoutes       = require('./routes/account');    // app register/login
const syncRoutes          = require('./routes/sync');       // app sync (assets pull/push)
const tenantRoutes        = require('./routes/tenants');
const userRoutes          = require('./routes/users');
const planRoutes          = require('./routes/plans');
const subscriptionRoutes  = require('./routes/subscriptions');
const assetRoutes         = require('./routes/assets');
const locationRoutes      = require('./routes/locations');
const auditRoutes         = require('./routes/audit');
const flagRoutes          = require('./routes/flags');
const metatagRoutes       = require('./routes/metatags');
const integrationRoutes   = require('./routes/integrations');
const complianceRoutes    = require('./routes/compliance');
const notificationRoutes  = require('./routes/notifications');
const dashboardRoutes     = require('./routes/dashboard');
const i18nRoutes          = require('./routes/i18n');
const storageRoutes       = require('./routes/storage');
const syncModulesRoutes   = require('./routes/sync-modules'); // módulos mobile (custos, seguros, vault…)
const sharesRoutes        = require('./routes/shares');
const chatRoutes          = require('./routes/chat');
const checklistsRoutes    = require('./routes/checklists');
const evaluationsRoutes       = require('./routes/evaluations');
const evaluationsPublicRoutes = require('./routes/evaluationsPublic');
const evaluationsAdminRoutes  = require('./routes/evaluationsAdmin');
const evaluationsWebBridgeRoutes = require('./routes/evaluationsWebBridge');
const checklistsAiRoutes  = require('./routes/checklistsAi');
const checklistsVisionRoutes = require('./routes/checklistsVision');
const checklistsVoiceNoteRoutes = require('./routes/checklistsVoiceNote');
const cockpitRoutes       = require('./routes/cockpit');
const collectionPolicyRoutes = require('./routes/collection-policy');
const {
  publicRouter: workTimePublicRouter,
  adminRouter: workTimeAdminRouter,
} = require('./routes/workTime');
const telemetryRoutes        = require('./routes/telemetry');
const metricsRoutes          = require('./routes/metrics');
const reportsRoutes          = require('./routes/reports');
const trackingRoutes         = require('./routes/tracking');  // public real-time tracking
const osrmProxyRoutes        = require('./routes/osrm-proxy'); // app: geometria OSRM via backend
const {
  publicRouter: technicianRegistrationPublicRouter,
  adminRouter: technicianRegistrationAdminRouter,
} = require('./routes/technicianRegistration');
const routineTasksAdminRoutes = require('./routes/routineTasksAdmin');
const {
  fetchProvidersFromCms,
  fetchCategoriesFromCms,
  fetchProviderDetailFromCms,
} = require('./lib/cmsDirectoryClient');
const { faToIonicons } = require('./lib/faToIonicons');

/**
 * Converte categorias globais do Laravel (nome + Fa*) para o formato do app (id = nome do filtro).
 */
function mapLaravelCategoriesForApp(json) {
  const rows = json && Array.isArray(json.data) ? json.data : [];
  return rows.map((row) => ({
    id: row.name,
    label: row.name,
    icon: faToIonicons(row.icon),
    color: row.color || '#6366F1',
    cmsId: row.id,
    parentId: row.parent_id || null,
  }));
}
const aiTechnicianProfilePhotoRoutes = require('./routes/aiTechnicianProfilePhoto');

const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ─────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/** Bridge servidor-a-servidor: Laravel → tokens JWT para o módulo de avaliações no BrsparkWeb */
app.use('/api/internal', evaluationsWebBridgeRoutes);

// ── Health ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    status: 'ok',
    ts: new Date().toISOString(),
    database: 'postgresql',
    adminPanel: 'Abra http://localhost:' + (process.env.PORT || 3001) + '/index.html',
  });
});

// ── Public routes ──────────────────────────────────────────
app.use('/api/auth',    authRoutes);    // admin: POST /api/auth/login | /tenant-login
app.post('/api/tenant-login', authRoutes.postTenantLogin); // alias (evita 404 se o cliente omitir /auth)
// Antes de app.use('/api', account): paths específicos — evita 404 «Route not found» quando o router /api não repassa subpaths em alguns deploys.
app.use('/api/ai-technician-profile-photo', aiTechnicianProfilePhotoRoutes);
app.use('/api/technician-registration/public', technicianRegistrationPublicRouter);
app.use('/api',         accountRoutes); // app:   POST /api/register | POST /api/login | GET /api/me
app.use('/api/sync',    syncRoutes);          // app: GET /api/sync/assets | POST /api/sync/push
app.use('/api/sync',    syncModulesRoutes);   // app: módulos — costs, insurance, vault, media…
app.use('/api/storage', storageRoutes);       // app: POST /api/storage/upload | GET /api/storage/config
app.use('/api/shares',  sharesRoutes);        // app: gerenciamento de compartilhamento
app.use('/api/chat',    chatRoutes);          // app: social & chat
app.use('/api/barcode', require('./routes/barcode')); // app: proxy integration com barcode (UPCItemDB/Cosmos)
app.use('/api/checklists', checklistsRoutes); // app/admin: forms and executions fsm
app.use('/api/routine-tasks', require('./routes/routineTasks')); // app: tarefas de rotina (RT)
app.use('/api/evaluations/public', evaluationsPublicRoutes); // cliente: formulário sem login
app.use('/api/evaluations', evaluationsRoutes); // app: Minha Produtividade / avaliações
app.use('/api/work-time', workTimePublicRouter); // app: GET /me, GET/POST punches (JWT utilizador)
app.use('/api/materials-receipt-inputs', require('./routes/materialsReceiptInputs'));
// Rotas IA (Excel → formulário): montagem explícita para não depender só de router.use no checklists.js
app.use('/api/checklists', checklistsAiRoutes);
app.use('/api/checklists', checklistsVisionRoutes);
app.use('/api/checklists', checklistsVoiceNoteRoutes);
app.use('/api/operations', require('./routes/operations')); // admin: kanban OS monitoring
// /api/vision → routes/account.js (CompreFace). /api/ai-technician-profile-photo → montado acima (gate IA cadastro prestador).

// Public: effective collection policy for mobile app (no auth)
app.get('/api/collection-policy/effective', collectionPolicyRoutes.effectiveHandler);

// Public compliance docs — no auth, for mobile app
app.get('/api/compliance/active', async (req, res) => {
  try {
    const { tenantId } = req.query;
    const where = { isActive: true };
    // If tenantId provided, return tenant-specific + global (merged, tenant-first)
    const docs = await prisma.complianceDoc.findMany({
      where: tenantId
        ? { isActive: true, OR: [{ tenantId }, { tenantId: null }] }
        : { isActive: true, tenantId: null },
      select: { id: true, type: true, version: true, title: true, publishedAt: true, tenantId: true },
      orderBy: [{ tenantId: 'asc' }, { type: 'asc' }],
    });
    // Dedupe: prefer tenant-specific over global per type
    const deduped = {};
    for (const d of docs) {
      if (!deduped[d.type] || d.tenantId) deduped[d.type] = d;
    }
    res.json(Object.values(deduped));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/compliance/active/:type', async (req, res) => {
  try {
    const { tenantId } = req.query;
    const type = req.params.type.toUpperCase();
    // Try tenant-specific first, fallback to global
    let doc = tenantId
      ? await prisma.complianceDoc.findFirst({
          where: { type, isActive: true, tenantId },
          orderBy: { publishedAt: 'desc' },
        })
      : null;
    if (!doc) {
      doc = await prisma.complianceDoc.findFirst({
        where: { type, isActive: true, tenantId: null },
        orderBy: { publishedAt: 'desc' },
      });
    }
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado.' });
    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/compliance/accept — registra ConsentRecord do técnico
app.post('/api/compliance/accept', async (req, res) => {
  try {
    const { ownerEmail, tenantId, policyId, docId, consentType, accepted, deviceId, appVersion } = req.body;
    if (!ownerEmail || !consentType || accepted === undefined) {
      return res.status(400).json({ error: 'ownerEmail, consentType e accepted são obrigatórios.' });
    }
    // Upsert — se já existe este consentType para este ownerEmail+policyId, revoga o anterior e cria novo
    if (policyId) {
      await prisma.consentRecord.updateMany({
        where: { ownerEmail, policyId, consentType, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    const record = await prisma.consentRecord.create({
      data: {
        ownerEmail, tenantId: tenantId || null,
        policyId: policyId || null, docId: docId || null,
        consentType, accepted,
        ipAddress: req.ip || null, deviceId: deviceId || null, appVersion: appVersion || null,
      },
    });
    res.status(201).json(record);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/compliance/consents — histórico de aceitações por técnico
app.get('/api/compliance/consents', async (req, res) => {
  try {
    const { ownerEmail } = req.query;
    if (!ownerEmail) return res.status(400).json({ error: 'ownerEmail é obrigatório.' });
    const records = await prisma.consentRecord.findMany({
      where: { ownerEmail },
      orderBy: { acceptedAt: 'desc' },
    });
    res.json(records);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const directoryPostgresFallbackEnabled = () =>
  String(process.env.DIRECTORY_POSTGRES_FALLBACK || '') === '1';

/**
 * Proxy público de ficheiros `/storage/...` do Laravel — o app móvel carrega da mesma origem que a API (evita ATS iOS em HTTP LAN).
 * Query: path — obrigatoriamente começa por `/storage/` (sem `..`).
 */
app.get('/api/directory-media', async (req, res) => {
  try {
    const rawPath = String(req.query.path || '').trim();
    if (!rawPath.startsWith('/storage/') || rawPath.includes('..')) {
      return res.status(400).type('text/plain').send('Caminho inválido.');
    }
    const cmsBase = (process.env.CMS_DIRECTORY_BASE_URL || '').replace(/\/$/, '');
    if (!cmsBase) {
      return res.status(503).type('text/plain').send('CMS não configurado.');
    }
    const upstream = `${cmsBase}${rawPath}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);
    let upstreamRes;
    try {
      upstreamRes = await fetch(upstream, {
        method: 'GET',
        headers: { Accept: '*/*' },
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!upstreamRes.ok) {
      return res.sendStatus(upstreamRes.status === 404 ? 404 : 502);
    }
    const ct = upstreamRes.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await upstreamRes.arrayBuffer());
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(buf);
  } catch (e) {
    console.warn('[api/directory-media]', e.message);
    return res.status(502).type('text/plain').send('Falha ao obter imagem.');
  }
});

// Public catalog: empresas — fonte oficial Laravel (CMS). PostgreSQL só com DIRECTORY_POSTGRES_FALLBACK=1.
app.get('/api/providers', async (req, res) => {
  try {
    const { category, q, city, page = '1', limit = '20' } = req.query;
    const take = Math.min(parseInt(limit, 10) || 20, 50);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);

    const qs = new URLSearchParams();
    if (q)        qs.set('q', String(q));
    if (category) qs.set('category', String(category));
    if (city)     qs.set('city', String(city));
    qs.set('page', String(pageNum));
    qs.set('limit', String(take));

    const cmsBase = (process.env.CMS_DIRECTORY_BASE_URL || '').replace(/\/$/, '');
    const pgFallback = directoryPostgresFallbackEnabled();

    const emptyPayload = () => ({
      data: [],
      total: 0,
      page: pageNum,
      limit: take,
      totalPages: 0,
    });

    if (cmsBase) {
      try {
        const json = await fetchProvidersFromCms(qs);
        res.set('Cache-Control', 'no-store');
        res.set('X-BrSpark-Directory-Source', 'laravel');
        return res.json({
          data:       json.data || [],
          total:      json.total ?? 0,
          page:       json.page ?? pageNum,
          limit:      json.limit ?? take,
          totalPages: json.totalPages ?? 1,
        });
      } catch (cmsErr) {
        console.warn('[api/providers] CMS directory falhou:', cmsErr.message);
        if (!pgFallback) {
          res.set('Cache-Control', 'no-store');
          res.set('X-BrSpark-Directory-Source', 'laravel-error');
          return res.json(emptyPayload());
        }
        console.warn('[api/providers] Fallback PostgreSQL (DIRECTORY_POSTGRES_FALLBACK=1).');
        res.set('X-BrSpark-Directory-Fallback', '1');
        res.set('X-BrSpark-Directory-Source', 'laravel-error-postgres');
      }
    } else if (!pgFallback) {
      res.set('Cache-Control', 'no-store');
      res.set('X-BrSpark-Directory-Source', 'cms-not-configured');
      return res.json(emptyPayload());
    }

    const skip = (pageNum - 1) * take;

    const where = { isActive: true };
    if (category) where.category = category;
    if (city)     where.city = { contains: city, mode: 'insensitive' };
    if (q) where.OR = [
      { name:     { contains: q, mode: 'insensitive' } },
      { keywords: { contains: q, mode: 'insensitive' } },
      { city:     { contains: q, mode: 'insensitive' } },
    ];

    const [providers, total] = await Promise.all([
      prisma.serviceProvider.findMany({
        where, orderBy: [{ rating: 'desc' }, { name: 'asc' }],
        take, skip,
      }),
      prisma.serviceProvider.count({ where }),
    ]);

    const nameHash = (str) => {
      let h = 0;
      for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
      return Math.abs(h);
    };

    const formatted = providers.map(p => {
      let photo = p.photo;
      if (!photo) {
        const h      = nameHash(p.name);
        const gender = h % 2 === 0 ? 'men' : 'women';
        const index  = h % 70;
        photo = `https://randomuser.me/api/portraits/${gender}/${index}.jpg`;
      }
      return {
        id:       p.id,
        name:     p.name,
        category: p.category,
        rating:   p.rating,
        reviews:  p.reviews,
        photo,
        tags:     Array.isArray(p.tags) ? p.tags.join(',') : (p.tags || ''),
        verified: p.verified ? 1 : 0,
        keywords: p.keywords || '',
        phone:    p.phone || null,
        city:     p.city || null,
        state:    p.state || 'SP',
      };
    });

    res.set('Cache-Control', 'no-store');
    if (!res.get('X-BrSpark-Directory-Source')) {
      res.set('X-BrSpark-Directory-Source', 'postgresql');
    }
    res.json({
      data:       formatted,
      total,
      page:       pageNum,
      limit:      take,
      totalPages: Math.ceil(total / take),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * Detalhe público do diretório — o app chama a mesma path que no Laravel; aqui faz-se de proxy ao CMS.
 * Sem isto, com API_BASE no Node, «Falha ao carregar empresa (404)» ao abrir o catálogo de serviços.
 */
app.get('/api/public/directory/providers/:id', async (req, res) => {
  try {
    const id = req.params.id != null ? String(req.params.id).trim() : '';
    if (!id) {
      return res.status(400).json({ error: 'Identificador obrigatório.' });
    }
    const cmsBase = (process.env.CMS_DIRECTORY_BASE_URL || '').replace(/\/$/, '');
    if (!cmsBase) {
      res.set('Cache-Control', 'no-store');
      res.set('X-BrSpark-Directory-Source', 'cms-not-configured');
      return res.status(503).json({ error: 'CMS_DIRECTORY_BASE_URL não configurado.' });
    }
    const json = await fetchProviderDetailFromCms(id);
    if (json == null) {
      return res.status(502).json({ error: 'Resposta inválida do CMS.' });
    }
    res.set('Cache-Control', 'no-store');
    res.set('X-BrSpark-Directory-Source', 'laravel');
    return res.json(json);
  } catch (err) {
    const status = Number(err.status) || 502;
    console.warn('[api/public/directory/providers/:id]', err.message);
    res.set('Cache-Control', 'no-store');
    res.set('X-BrSpark-Directory-Source', 'laravel-error');
    if (status === 404) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }
    return res.status(status >= 400 && status < 600 ? status : 502).json({
      error: err.message || 'Falha ao obter detalhe do diretório no CMS.',
    });
  }
});

/** Diagnóstico: o app usa este BFF; lista vem do Laravel salvo DIRECTORY_POSTGRES_FALLBACK=1. */
app.get('/api/directory-status', async (_req, res) => {
  const base = (process.env.CMS_DIRECTORY_BASE_URL || '').replace(/\/$/, '');
  const pgFallback = directoryPostgresFallbackEnabled();
  if (!base) {
    return res.json({
      ok: false,
      cmsConfigured: false,
      postgresFallbackEnabled: pgFallback,
      source: pgFallback ? 'postgresql' : 'empty',
      hint: 'Defina CMS_DIRECTORY_BASE_URL no .env do admin-panel/backend (URL base do Laravel, ex.: http://127.0.0.1:8000). Sem CMS e sem DIRECTORY_POSTGRES_FALLBACK=1, o diretório fica vazio.',
    });
  }
  const url = `${base}/api/public/directory/providers?limit=1&page=1`;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ac.signal });
    clearTimeout(t);
    const body = r.ok ? await r.json().catch(() => ({})) : null;
    return res.json({
      ok: r.ok,
      cmsConfigured: true,
      cmsBaseUrl: base,
      probeUrl: url,
      cmsHttpStatus: r.status,
      source: r.ok ? 'laravel' : 'laravel-unreachable',
      sampleTotal: body && typeof body.total === 'number' ? body.total : null,
      hint: r.ok
        ? null
        : 'Laravel não respondeu OK. Confirme php artisan serve (ou URL de produção) e que a rota /api/public/directory/providers existe.',
    });
  } catch (e) {
    return res.json({
      ok: false,
      cmsConfigured: true,
      cmsBaseUrl: base,
      probeUrl: url,
      source: 'laravel-error',
      error: e.message,
      hint: 'Erro de rede até o Laravel (firewall, host errado, Laravel parado).',
    });
  }
});

/** Catálogo de categorias do diretório — mesma fonte que o CMS Web (Laravel). */
app.get('/api/directory/categories', async (_req, res) => {
  try {
    const cmsBase = (process.env.CMS_DIRECTORY_BASE_URL || '').replace(/\/$/, '');
    if (!cmsBase) {
      return res.status(503).json({
        error: 'CMS_DIRECTORY_BASE_URL não configurado.',
        data: [],
      });
    }
    const json = await fetchCategoriesFromCms();
    const data = mapLaravelCategoriesForApp(json);
    res.set('Cache-Control', 'public, max-age=300');
    res.set('X-BrSpark-Category-Source', 'laravel');
    return res.json({ data });
  } catch (err) {
    console.warn('[api/directory/categories]', err.message);
    res.set('X-BrSpark-Category-Source', 'laravel-error');
    return res.status(502).json({ error: err.message || 'Falha ao obter categorias do CMS.', data: [] });
  }
});


// Public config: metatags/locales para inicializar o app (sem auth ou via tenantId)
app.get('/api/config', async (req, res) => {
  try {
    const { tenantId, lang = 'pt-BR' } = req.query;
    
    // 1. Fetch locale profile if tenantId provided
    let locale = null;
    if (tenantId) {
       const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          include: { locale: true }
       });
       locale = tenant?.locale;
    }

    // 2. Fetch active metatags
    const metatags = await prisma.metatag.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    });

    // 3. Rótulo por idioma (campos ptBr / enUs / esEs no modelo)
    const getLabel = (m, targetLang) => {
      const L = String(targetLang || '').replace('_', '-');
      if (L === 'en-US' || L === 'en') return m.enUs || m.ptBr || m.key;
      if (L === 'es-ES' || L === 'es') return m.esEs || m.ptBr || m.key;
      return m.ptBr || m.key;
    };

    const assetTypes = metatags.filter(m => m.type === 'ASSET_TYPE').map(m => ({
      id: m.key,
      titleKey: getLabel(m, lang),
      icon: m.icon || 'cube-outline',
      color: m.color || '#6366F1',
    }));

    let categories = metatags.filter(m => m.type === 'SERVICE_CATEGORY').map(m => ({
      id: m.key,
      label: getLabel(m, lang),
      icon: m.icon || 'grid-outline',
    }));

    const cmsBase = (process.env.CMS_DIRECTORY_BASE_URL || '').replace(/\/$/, '');
    if (cmsBase) {
      try {
        const cmsJson = await fetchCategoriesFromCms();
        const fromCms = mapLaravelCategoriesForApp(cmsJson);
        if (fromCms.length) {
          categories = fromCms;
        }
      } catch (e) {
        console.warn('[api/config] categorias CMS indisponíveis, mantém metatags:', e.message);
      }
    }

    const technicianExpenseCategories = metatags
      .filter(m => m.type === 'TECHNICIAN_EXPENSE_CATEGORY')
      .map(m => ({
        id: m.key,
        label: getLabel(m, lang),
        icon: m.icon || 'pricetag-outline',
        color: m.color || '#64748B',
      }));

    // URL base OSRM para o app (Integrações → OSRM); fallback = demo público
    let osrmBaseUrl = DEFAULT_OSRM_BASE;
    try {
      const osrmRow = await prisma.integration.findFirst({
        where: { name: 'OSRM', status: 'ACTIVE' },
        select: { baseUrl: true },
      });
      if (osrmRow?.baseUrl) osrmBaseUrl = normalizeOsrmBaseUrl(osrmRow.baseUrl);
    } catch (_) { /* mantém default */ }

    res.json({
      assetTypes,
      categories,
      technicianExpenseCategories,
      locale, // Send the formatting rules (currency, dateFormat, etc)
      osrmBaseUrl,
      updatedAt: new Date(),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.use('/api/i18n', i18nRoutes);

// ── Protected routes (require admin JWT) ──────────────────
app.use('/api/admin/evaluations', adminAuthThenPanel, evaluationsAdminRoutes);
app.use('/api/dashboard',     adminAuthThenPanel, dashboardRoutes);
app.use('/api/tenants',       adminAuthThenPanel, tenantRoutes);
app.use('/api/users',         adminAuthThenPanel, userRoutes);
app.use('/api/plans',         adminAuthThenPanel, planRoutes);
app.use('/api/subscriptions', adminAuthThenPanel, subscriptionRoutes);
app.use('/api/assets',        adminAuthThenPanel, assetRoutes);
app.use('/api/locations',     adminAuthThenPanel, locationRoutes);
app.use('/api/audit',         adminAuthThenPanel, auditRoutes);
app.use('/api/flags',         adminAuthThenPanel, flagRoutes);
app.use('/api/metatags',      adminAuthThenPanel, metatagRoutes);
app.use('/api/integrations',  adminAuthThenPanel, integrationRoutes);
app.use('/api/compliance',         adminAuthThenPanel, complianceRoutes);
app.use('/api/notifications',      adminAuthThenPanel, notificationRoutes);
app.use('/api/cockpit',            adminAuthThenPanel, cockpitRoutes);
app.use('/api/collection-policy',  adminAuthThenPanel, collectionPolicyRoutes);
app.use('/api/work-time', adminAuthThenPanel, workTimeAdminRouter); // painel: GET/PATCH /settings
app.use('/api/admin/routine-tasks', adminAuthThenPanel, routineTasksAdminRoutes);
app.use('/api/telemetry',          telemetryRoutes);  // sem adminAuth — aceita lotes do app
app.use('/api/metrics',            adminAuthThenPanel, metricsRoutes);
app.use('/api/reports',            reportsRoutes); // presets: adminAuth por rota; export: admin ou REPORTS_API_KEY
app.use('/api/tracking',           trackingRoutes);   // sem adminAuth — link público para clientes
app.use('/api/osrm',               osrmProxyRoutes);   // sem adminAuth — mesmo alcance que /api/config
app.use('/api/technician-registration', adminAuthThenPanel, technicianRegistrationAdminRouter);

// ── Painel estático e uploads (depois das rotas /api para não sombrear a API) ──
app.use(express.static(path.join(__dirname, '../../')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// ── 404 ───────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Error handler ──────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────
(async function startServer() {
  if (String(process.env.SKIP_CHAT_LOCALE_SCHEMA_ENSURE || '').trim() !== '1') {
    try {
      await ensureChatLocaleSchema(prisma);
    } catch (e) {
      console.warn(
        '[schema] Colunas de chat (preferred_chat_locale / translations) não puderam ser garantidas — execute `npm run db:migrate` no backend. Detalhe:',
        e?.message || e,
      );
    }
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 BrSpark Admin API running on http://0.0.0.0:${PORT} (LAN: use o IP da máquina na mesma porta)`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Database:    ${process.env.DATABASE_URL?.split('@')[1] || 'Not configured'}\n`);

    // ── Backup automático ao iniciar (1× por hora no máximo) ──
    const { execFile } = require('child_process');
    const fs = require('fs');
    const backupDir = path.join(__dirname, '../../backups');
    const flagFile = path.join(backupDir, '.last_auto_backup');

    const oneHour = 60 * 60 * 1000;
    let shouldBackup = true;

    if (fs.existsSync(flagFile)) {
      const lastTs = parseInt(fs.readFileSync(flagFile, 'utf8').trim(), 10) || 0;
      if (Date.now() - lastTs < oneHour) shouldBackup = false;
    }

    if (shouldBackup) {
      const backupScript = path.join(__dirname, '../scripts/backup.sh');
      if (fs.existsSync(backupScript)) {
        execFile('bash', [backupScript, 'auto-start'], { timeout: 60000 }, (err, stdout) => {
          if (err) {
            console.warn('[BACKUP] Falhou no startup:', err.message);
            return;
          }
          console.log('[BACKUP]', stdout.trim().split('\n').pop());
          fs.mkdirSync(backupDir, { recursive: true });
          fs.writeFileSync(flagFile, String(Date.now()));
        });
      }
    }

    // Garante FT-AAAA-MM-NNNNNNN em execuções antigas (idempotente; desligar com SKIP_OS_NUMBER_BACKFILL_ON_START=1).
    if (String(process.env.SKIP_OS_NUMBER_BACKFILL_ON_START || '').trim() !== '1') {
      setImmediate(() => {
        runBackfillOsNumbers(prisma)
          .then((r) => {
            if (!r.skipped) {
              console.log(`[osNumber] Backfill no arranque: ${r.updated} OS(s) numeradas (FT).`);
            }
          })
          .catch((e) => console.warn('[osNumber] Backfill no arranque falhou (BD indisponível?):', e.message));
      });
    }
  });

  server.on('error', (err) => {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'EADDRINUSE') {
      console.error(
        `\n[BrSpark] Porta ${PORT} já está em uso — provavelmente outro \`node src/index.js\` ou \`npm run dev\` nesta máquina.\n` +
          `  • Ver o processo:  lsof -nP -iTCP:${PORT} -sTCP:LISTEN\n` +
          `  • Libertar:        kill <PID>   (feche o outro terminal se for o caso)\n` +
          `  • Outra porta:     PORT=3002 npm run dev   (ajuste EXPO_PUBLIC_API_BASE no app para …:3002)\n`,
      );
      process.exit(1);
      return;
    }
    console.error('[BrSpark] Erro ao escutar HTTP:', err);
    process.exit(1);
  });
})().catch((e) => {
  console.error('Falha crítica ao iniciar API:', e);
  process.exit(1);
});
