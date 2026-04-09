'use strict';
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');

const { adminAuthThenPanel } = require('./middleware/auth');
const prisma          = require('./db');
const { runBackfillOsNumbers } = require('./lib/backfillOsNumbersLib');
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
const checklistsAiRoutes  = require('./routes/checklistsAi');
const cockpitRoutes       = require('./routes/cockpit');
const collectionPolicyRoutes = require('./routes/collection-policy');
const telemetryRoutes        = require('./routes/telemetry');
const metricsRoutes          = require('./routes/metrics');
const reportsRoutes          = require('./routes/reports');
const trackingRoutes         = require('./routes/tracking');  // public real-time tracking
const osrmProxyRoutes        = require('./routes/osrm-proxy'); // app: geometria OSRM via backend

const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ─────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

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
app.use('/api',         accountRoutes); // app:   POST /api/register | POST /api/login | GET /api/me
app.use('/api/sync',    syncRoutes);          // app: GET /api/sync/assets | POST /api/sync/push
app.use('/api/sync',    syncModulesRoutes);   // app: módulos — costs, insurance, vault, media…
app.use('/api/storage', storageRoutes);       // app: POST /api/storage/upload | GET /api/storage/config
app.use('/api/shares',  sharesRoutes);        // app: gerenciamento de compartilhamento
app.use('/api/chat',    chatRoutes);          // app: social & chat
app.use('/api/barcode', require('./routes/barcode')); // app: proxy integration com barcode (UPCItemDB/Cosmos)
app.use('/api/checklists', checklistsRoutes); // app/admin: forms and executions fsm
app.use('/api/evaluations/public', evaluationsPublicRoutes); // cliente: formulário sem login
app.use('/api/evaluations', evaluationsRoutes); // app: Minha Produtividade / avaliações
app.use('/api/materials-receipt-inputs', require('./routes/materialsReceiptInputs'));
// Rotas IA (Excel → formulário): montagem explícita para não depender só de router.use no checklists.js
app.use('/api/checklists', checklistsAiRoutes);
app.use('/api/operations', require('./routes/operations')); // admin: kanban OS monitoring
app.use('/api/vision',     require('./routes/vision'));     // app: biometria e IA yüz tanıma

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

// Public catalog: prestadores de serviço — paginado, filtrado, máx 50 por request
app.get('/api/providers', async (req, res) => {
  try {
    const { category, q, city, page = '1', limit = '20' } = req.query;
    const take = Math.min(parseInt(limit, 10) || 20, 50); // hard cap: 50
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

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

    /** Stable hash: same name → same portrait every time */
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
        const index  = h % 70;   // randomuser.me has portraits 0-99 but 0-69 are safest
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
    res.json({
      data:       formatted,
      total,
      page:       parseInt(page, 10),
      limit:      take,
      totalPages: Math.ceil(total / take),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

    const categories = metatags.filter(m => m.type === 'SERVICE_CATEGORY').map(m => ({
      id: m.key,
      label: getLabel(m, lang),
      icon: m.icon || 'grid-outline',
    }));

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
app.use('/api/telemetry',          telemetryRoutes);  // sem adminAuth — aceita lotes do app
app.use('/api/metrics',            adminAuthThenPanel, metricsRoutes);
app.use('/api/reports',            reportsRoutes); // presets: adminAuth por rota; export: admin ou REPORTS_API_KEY
app.use('/api/tracking',           trackingRoutes);   // sem adminAuth — link público para clientes
app.use('/api/osrm',               osrmProxyRoutes);   // sem adminAuth — mesmo alcance que /api/config

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
app.listen(PORT, () => {
  console.log(`\n🚀 BrSpark Admin API running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Database:    ${process.env.DATABASE_URL?.split('@')[1] || 'Not configured'}\n`);

  // ── Backup automático ao iniciar (1× por hora no máximo) ──
  const { execFile } = require('child_process');
  const fs = require('fs');
  const backupDir = path.join(__dirname, '../../backups');
  const flagFile  = path.join(backupDir, '.last_auto_backup');

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
        if (err) { console.warn('[BACKUP] Falhou no startup:', err.message); return; }
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
