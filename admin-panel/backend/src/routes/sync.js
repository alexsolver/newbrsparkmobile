'use strict';
const crypto = require('crypto');
const router  = require('express').Router();
const prisma  = require('../db');
const authUser = require('../middleware/authUser');
const { recordSync } = require('../services/cockpitMetrics');
const { effectiveLastSubmittedRevision } = require('../lib/effectiveExecutionRevision');
const techStockMovementsSearchHandler = require('../lib/techStockMovementsSearchHandler');
const { canReceiveFieldTasksForAppSession } = require('../lib/technicianEligibility');
const { broadcastCandidateArray, normalizeEmail: normalizeSyncEmail } = require('../lib/fieldTaskExecutionAccess');
const { resolveFieldTaskOwnerEmailCandidatesForAppUser } = require('../lib/userEmailUnique');
const {
  getTenantKind,
  buildAssetVisibilityWhere,
  assertUserCanMutateAsset,
  assertProviderTenantAllowsCreate,
} = require('../lib/tenantAssetSyncPolicy');
const { prismaWhereExecutionBelongsToAppFieldTaskScope } = require('../lib/fieldTaskExecutionTenantScope');
const { isAppUserInDedicatedExclusiveAt } = require('../lib/providerDedicatedExclusiveService');

// Todas as rotas de sync exigem JWT de usuário (não de admin)
router.use(authUser);

// ─── POST /api/sync/push_token ────────────────────────────────────────────────
// App móvel envia o token do expo para receber pushes.
router.post('/push_token', async (req, res) => {
  try {
    const { id: userId } = req.user;
    const { token, device } = req.body;
    if (!token) return res.status(400).json({ error: 'Token é obrigatório.' });

    const existing = await prisma.pushToken.findUnique({ where: { token } });
    if (existing) {
      if (existing.userId !== userId) {
         await prisma.pushToken.update({ where: { token }, data: { userId, device } });
      }
    } else {
      await prisma.pushToken.create({ data: { userId, token, device } });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/sync/push_token error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/assets ─────────────────────────────────────────────────────
// Lista de bens conforme o tipo de tenant (COMPANY / CLIENT / PROVIDER) + partilhas aceites.
router.get('/assets', async (req, res) => {
  try {
    const { tenantId, email, id: userId } = req.user;

    const shares = await prisma.assetShare.findMany({
      where: {
        sharedWithEmail: email.toLowerCase(),
        status: 'ACCEPTED',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { assetId: true, permission: true },
    });
    const sharedAssetIds = shares.map((s) => s.assetId);

    const tenantKind = await getTenantKind(prisma, tenantId);
    const visibilityWhere = buildAssetVisibilityWhere({
      tenantKind,
      tenantId,
      userId,
      userEmail: email,
      sharedAssetIds,
    });

    let assets = await prisma.asset.findMany({
      where: visibilityWhere,
      include: {
        location: true,
        stockItems: true,
        children: { select: { id: true } },
        parent: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Injetar _isShared no details e formatar a saída final
    assets = assets.map((asset) => {
      if (sharedAssetIds.includes(asset.id)) {
        let detailsObj = {};
        if (asset.metadata && typeof asset.metadata === 'object') {
          detailsObj = { ...asset.metadata };
        } else if (asset.metadata) {
          try { detailsObj = JSON.parse(asset.metadata); } catch(e){}
        }
        detailsObj._isShared = true;
        // Permissão concedida a este usuário (se mais de uma aplica-se a melhor, mas simplificamos por id)
        const shareRecord = shares.find(s => s.assetId === asset.id);
        if (shareRecord) detailsObj._permission = shareRecord.permission;
        
        return {
          ...asset,
          metadata: detailsObj
        };
      }
      return asset;
    });

    // Formata para o formato esperado pelo app mobile
    const formatted = assets.map(a => ({
      id:           a.id,
      title:        a.title,
      type:         a.type,
      status:       a.status,
      statusType:   a.metadata?.statusType || 'success',
      imageUrl:     a.imageUrl || null,
      parentId:     a.parentId || null,
      childrenCount: a.children.length,
      details:      a.metadata || {},
      deletedAt:    null,
    }));

    res.json(formatted);
  } catch (err) {
    console.error('[sync/assets]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/sync/push ──────────────────────────────────────────────────────
// Recebe ações offline do app e persiste no banco
router.post('/push', async (req, res) => {
  try {
    const { tenantId, id: userId, email } = req.user;
    const { queue = [] } = req.body;
    const tenantKind = await getTenantKind(prisma, tenantId);

    let processed = 0;
    const processedIds = [];
    for (const item of queue) {
      try {
        const p = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;

        /** Só incrementa processed / processedIds quando a fila foi realmente tratada aqui.
         * Ações como costs:*, agenda:*, CREATE_NOTE são redundantes com POST /api/sync/* em massa
         * ou ainda sem handler — não podem ser removidas da fila sem persistência. */
        let handled = false;

        switch (item.action) {
          case 'CREATE_ASSET':
          case 'UPDATE_ASSET': {
            let safeType = p.type || 'OTHER';
            if (safeType === 'VEHICLE') safeType = 'MOBILITY';
            if (safeType === 'TERRESTRIAL') safeType = 'MOBILITY';

            const existing = await prisma.asset.findUnique({ where: { id: p.id } });
            if (existing) {
              await assertUserCanMutateAsset(prisma, {
                tenantId,
                userId,
                userEmail: email,
                tenantKind,
                asset: existing,
              });
            } else {
              assertProviderTenantAllowsCreate(tenantKind);
            }

            await prisma.asset.upsert({
              where: { id: p.id },
              create: {
                id: p.id,
                tenantId,
                title: p.title,
                type: safeType,
                status: p.status || 'OPERATIONAL',
                imageUrl: p.imageUrl || null,
                parentId: p.parentId || null,
                metadata: p.details || {},
                createdByUserId: userId,
              },
              update: {
                title: p.title,
                status: p.status || 'OPERATIONAL',
                imageUrl: p.imageUrl || null,
                parentId: p.parentId || null,
                metadata: p.details || {},
              },
            });
            handled = true;
            break;
          }
          case 'DELETE_ASSET': {
            const row = await prisma.asset.findUnique({ where: { id: p.id } });
            if (row) {
              await assertUserCanMutateAsset(prisma, {
                tenantId,
                userId,
                userEmail: email,
                tenantKind,
                asset: row,
              });
            }
            await prisma.asset.updateMany({
              where: { id: p.id },
              data: { deletedAt: new Date() },
            });
            handled = true;
            break;
          }
          case 'SCHEDULE_MAINTENANCE': {
            // Cliente apenas confirma UX; manutenção segue outros fluxos / sync de dados
            handled = true;
            break;
          }
          default:
            console.log(
              `[sync/push] Ação ignorada neste endpoint (mantida na fila): ${item.action}`
            );
        }

        if (handled) {
          processed++;
          if (item.id != null) processedIds.push(item.id);
          const payloadSize = item.payload ? JSON.stringify(item.payload).length : 0;
          recordSync(userId, true, payloadSize);
        }
      } catch (itemErr) {
        console.error(`[sync/push] Erro ao processar item ${item.action} (Payload ID: ${item.id}):`, itemErr);
        recordSync(userId, false, 0, itemErr.message);
      }
    }

    // Audit
    if (processed > 0) {
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'SYNC_PUSH',
          resource: 'ASSET',
          category: 'DATA',
          metadata: { message: `Sincronizados ${processed} itens da fila offline.` },
        },
      });
    }

    res.json({ ok: true, processed, total: queue.length, processedIds });
  } catch (err) {
    console.error('[sync/push]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/sync/asset ─────────────────────────────────────────────────────
// Salva/atualiza um único bem diretamente (operações online)
router.post('/asset', async (req, res) => {
  try {
    const { tenantId, id: userId, email } = req.user;
    const p = req.body;
    const tenantKind = await getTenantKind(prisma, tenantId);
    const pid = p.id && String(p.id).trim() ? String(p.id).trim() : crypto.randomUUID();
    const existing = await prisma.asset.findUnique({ where: { id: pid } });
    if (existing) {
      await assertUserCanMutateAsset(prisma, {
        tenantId,
        userId,
        userEmail: email,
        tenantKind,
        asset: existing,
      });
    } else {
      assertProviderTenantAllowsCreate(tenantKind);
    }

    const asset = await prisma.asset.upsert({
      where: { id: pid },
      create: {
        tenantId,
        title: p.title,
        type: p.type || 'OTHER',
        status: p.status || 'OPERACIONAL',
        imageUrl: p.imageUrl || null,
        parentId: p.parentId || null,
        metadata: p.details || {},
        createdByUserId: userId,
      },
      update: {
        title: p.title,
        status: p.status,
        imageUrl: p.imageUrl || null,
        parentId: p.parentId || null,
        metadata: p.details || {},
      },
    });

    res.json({ id: asset.id, ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/providers ──────────────────────────────────────────────────
// Catálogo offline: só PostgreSQL se DIRECTORY_POSTGRES_FALLBACK=1 (legado). Caso contrário [] — diretório vem do CMS via /api/providers.
router.get('/providers', async (_req, res) => {
  try {
    if (String(process.env.DIRECTORY_POSTGRES_FALLBACK || '') !== '1') {
      res.set('X-BrSpark-Sync-Providers-Source', 'disabled');
      return res.json([]);
    }
    const providers = await prisma.serviceProvider.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { rating: 'desc' }],
    });
    // Formata para o esquema da tabela `providers` no SQLite do app
    const formatted = providers.map(p => ({
      id:       p.id,
      name:     p.name,
      category: p.category,
      rating:   p.rating,
      reviews:  p.reviews,
      photo:    p.photo || null,
      tags:     Array.isArray(p.tags) ? p.tags.join(',') : (p.tags || ''),
      verified: p.verified ? 1 : 0,
      keywords: p.keywords || '',
      phone:    p.phone || null,
      city:     p.city || null,
      state:    p.state || 'SP',
    }));
    res.json(formatted);
  } catch (err) {
    console.error('[sync/providers]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/config ─────────────────────────────────────────────────────
// Retorna configurações globais do sistema (categorias, tipos de ativo, etc.)
router.get('/config', async (_req, res) => {
  try {
    const metatags = await prisma.metatag.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    });

    const assetTypes = metatags.filter(m => m.type === 'ASSET_TYPE').map(m => ({
      id: m.key,
      titleKey: m.ptBr || m.key,
      subtitleKey: m.enUs || m.key,
      icon: m.icon || 'cube-outline',
      color: m.color || '#6366F1',
    }));

    const categories = metatags.filter(m => m.type === 'SERVICE_CATEGORY').map(m => ({
      id: m.key,
      label: m.ptBr || m.key,
      icon: m.icon || 'grid-outline',
    }));

    const technicianExpenseCategories = metatags
      .filter(m => m.type === 'TECHNICIAN_EXPENSE_CATEGORY')
      .map(m => ({
        id: m.key,
        label: m.ptBr || m.key,
        icon: m.icon || 'pricetag-outline',
        color: m.color || '#64748B',
      }));

    res.json({ assetTypes, categories, technicianExpenseCategories, updatedAt: new Date() });
  } catch (err) {
    console.error('[sync/config]', err);
    res.status(500).json({ error: err.message });
  }
});

function toYmd(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(x.getTime())) return new Date().toISOString().split('T')[0];
  return x.toISOString().split('T')[0];
}

/** Ícone do formulário (`ChecklistTemplate.metadata`) para o cartão da OS no app. */
function parseChecklistTemplateMetadataIcon(templateRow) {
  if (!templateRow) return { icon: '', iconLibrary: '' };
  const raw = templateRow.metadata;
  let o = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    o = raw;
  } else if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object' && !Array.isArray(p)) o = p;
    } catch {
      o = {};
    }
  }
  const icon = o.icon != null ? String(o.icon).trim() : '';
  const iconLibrary = o.iconLibrary != null ? String(o.iconLibrary).trim() : '';
  return { icon, iconLibrary };
}

function mapChecklistExecutionToSyncTask(ex) {
  let meta = ex.metadata || {};
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch (e) {
      meta = {};
    }
  }

  const { icon: templateIcon, iconLibrary: templateIconLibrary } = parseChecklistTemplateMetadataIcon(
    ex.template
  );
  const metaOut = { ...meta };
  if (templateIcon) {
    metaOut.icon = templateIcon;
    metaOut.iconLibrary = templateIconLibrary || 'Ionicons';
  }

  const refId = meta.refId || ex.templateId || null;
  const title = meta.title || ex.template?.title || 'Nova OS Designada';
  const templateTitle =
    (meta.templateTitle != null && String(meta.templateTitle).trim()) ||
    ex.template?.title ||
    null;
  const description = meta.description || ex.template?.description || 'Tarefa de rotina despachada.';

  const isDone = ['COMPLETED', 'SYNCED', 'CANCELLED', 'CANCELED'].includes(String(ex.status || '').toUpperCase());
  const anchorDate = isDone && ex.completedAt ? ex.completedAt : ex.createdAt;

  const hasAgendaSlot =
    ex.scheduledStartAt &&
    ex.expectedFormDurationMinutes != null &&
    Number.isFinite(Number(ex.expectedFormDurationMinutes)) &&
    Number(ex.expectedFormDurationMinutes) > 0;

  let startDate;
  let endDate;
  let isAllDay = true;
  let scheduledStartAt = null;
  let agendaStartAt = null;
  let agendaEndAt = null;
  let expectedFormDurationMinutes = null;

  if (hasAgendaSlot) {
    const start = new Date(ex.scheduledStartAt);
    const dur = Math.floor(Number(ex.expectedFormDurationMinutes));
    const endMs = start.getTime() + dur * 60000;
    const end = new Date(endMs);
    startDate = toYmd(start);
    endDate = toYmd(new Date(endMs - 1));
    isAllDay = false;
    scheduledStartAt = start.toISOString();
    agendaStartAt = scheduledStartAt;
    agendaEndAt = end.toISOString();
    expectedFormDurationMinutes = dur;
  } else {
    const anchor = anchorDate instanceof Date ? anchorDate : new Date(anchorDate);
    startDate = toYmd(anchor);
    endDate = toYmd(new Date(anchor.getTime() + 86400000));
    const snapMin = ex.expectedFormDurationMinutes;
    if (snapMin != null && Number.isFinite(Number(snapMin)) && Number(snapMin) > 0) {
      expectedFormDurationMinutes = Math.floor(Number(snapMin));
    }
  }

  /** Fim da janela prevista só do formulário — espelho semântico de agendaEndAt quando há slot na agenda. */
  const plannedFormEndAt = hasAgendaSlot ? agendaEndAt : null;
  const startedAtIso = ex.startedAt ? new Date(ex.startedAt).toISOString() : null;
  const completedAtIso = ex.completedAt ? new Date(ex.completedAt).toISOString() : null;

  const executionCreatedIso = ex.createdAt
    ? new Date(ex.createdAt).toISOString()
    : null;

  const routineTaskNumber = ex.routineTaskNumber != null ? String(ex.routineTaskNumber).trim() : '';
  const isRt = routineTaskNumber.length > 0;

  const am = String(ex.assignmentMode || 'DIRECT').toUpperCase();
  const cs = ex.claimStatus != null ? String(ex.claimStatus).toUpperCase() : '';
  const broadcastClaimPending = am === 'BROADCAST' && cs === 'OPEN';

  let broadcastClaimExpiresIso = null;
  if (broadcastClaimPending && ex.broadcastClaimExpiresAt != null) {
    const rawExp = ex.broadcastClaimExpiresAt;
    const expD =
      rawExp instanceof Date && !Number.isNaN(rawExp.getTime())
        ? rawExp
        : new Date(rawExp);
    if (!Number.isNaN(expD.getTime())) {
      broadcastClaimExpiresIso = expD.toISOString();
      metaOut.broadcastClaimExpiresAt = broadcastClaimExpiresIso;
    }
  }

  return {
    id: ex.id,
    osNumber: ex.osNumber || null,
    routineTaskNumber: isRt ? routineTaskNumber : null,
    /** Criação da execução no servidor (ordenar / portabilidade no app). */
    executionCreatedAt: executionCreatedIso,
    lastSubmittedRevision: effectiveLastSubmittedRevision(
      ex.lastSubmittedRevision,
      ex.revisions?.[0]?.revision
    ),
    refId,
    ownerEmail: ex.ownerEmail,
    category: 'TASK',
    startDate,
    endDate,
    isAllDay,
    source: isRt ? 'ROUTINE_TASK' : 'CHECKLIST',
    metadata: metaOut,
    title,
    templateTitle,
    description,
    status: ex.status,
    locationLat: ex.locationLat ?? null,
    locationLng: ex.locationLng ?? null,
    locationRadius: ex.locationRadius ?? null,
    locationAddress: ex.locationAddress || null,
    locationZoneType: ex.locationZoneType || null,
    locationPolygon: ex.locationPolygon || null,
    etaMinutes: ex.etaMinutes ?? null,
    scheduledStartAt,
    agendaStartAt,
    agendaEndAt,
    expectedFormDurationMinutes,
    /** Mesmo instante que agendaEndAt quando há slot — nome explícito para clientes (só formulário, sem deslocamento). */
    plannedFormEndAt,
    startedAt: startedAtIso,
    completedAt: completedAtIso,
    assignmentMode: ex.assignmentMode || 'DIRECT',
    claimStatus: ex.claimStatus ?? null,
    broadcastClaimPending,
    /** Fim da janela para aceitar a oferta (UTC ISO 8601). Só relevante com broadcastClaimPending. */
    broadcastClaimExpiresAt: broadcastClaimExpiresIso,
  };
}

// ─── GET /api/sync/tasks ──────────────────────────────────────────────────────
// Campos de tempo: scheduledStartAt + expectedFormDurationMinutes definem a janela prevista do
// formulário (agendaStartAt/agendaEndAt/plannedFormEndAt); startedAt/completedAt são tempos reais da execução.
// OS ativas (pendentes / em campo) + concluídas recentes no servidor (para aba "Concluídas"
// sem depender só do AsyncStorage local do celular).
router.get('/tasks', async (req, res) => {
  try {
    const jwtEmail = String(req.user?.email || '').trim();
    const qEmail = String(req.query.owner_email || '').trim();
    const ownerCandidates = await resolveFieldTaskOwnerEmailCandidatesForAppUser(prisma, req.user.id);
    const candSet = new Set(ownerCandidates.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean));
    if (qEmail) {
      const qn = qEmail.toLowerCase();
      if (!candSet.has(qn) && qn !== jwtEmail.toLowerCase()) {
        return res.status(403).json({ error: 'owner_email não coincide com o usuário autenticado.' });
      }
    }
    const ownerEmail = qEmail || jwtEmail;
    if (!ownerEmail) return res.status(400).json({ error: 'owner_email obrigatório.' });

    const tenantId = String(req.user?.tenantId || '').trim();
    if (!tenantId) {
      console.warn('[sync/tasks] JWT sem tenantId — retorno vazio (isolamento multi-tenant).');
      return res.json([]);
    }

    const canReceiveOs = await canReceiveFieldTasksForAppSession(prisma, {
      userId: req.user.id,
      email: ownerEmail,
      effectiveTenantId: tenantId,
    });
    if (!canReceiveOs) {
      console.log(
        `[sync/tasks] ${ownerEmail} — inelegível para FT/OS neste contexto (perfil cliente ou tenant ≠ sessão efetiva); retorno vazio.`
      );
      return res.json([]);
    }

    /**
     * `ChecklistExecution` não tem coluna tenantId. Sem filtro, `ownerEmail` sozinho devolvia
     * execuções homónimas noutros tenants e `BROADCAST+OPEN` carregava ofertas de todo o sistema.
     * Inclui tenant «casa» do utilizador além do tenant efetivo da sessão — senão FT despachadas
     * com `fieldTaskContextTenantId` na org de registo somem quando o JWT opera noutro espaço (ex.: PROVIDER).
     */
    const executionBelongsToJwtTenant = await prismaWhereExecutionBelongsToAppFieldTaskScope(prisma, {
      effectiveTenantId: tenantId,
      userId: req.user.id,
    });

    /** `ownerEmail` na OS pode ser o login canónico; o JWT traz `User.email` sintético do mesmo AppAccount. */
    const ownerEmailClause =
      ownerCandidates.length === 0
        ? { ownerEmail: { equals: ownerEmail, mode: 'insensitive' } }
        : ownerCandidates.length === 1
          ? { ownerEmail: { equals: ownerCandidates[0], mode: 'insensitive' } }
          : { OR: ownerCandidates.map((em) => ({ ownerEmail: { equals: em, mode: 'insensitive' } })) };

    const revInclude = {
      revisions: {
        select: { revision: true },
        orderBy: { revision: 'desc' },
        take: 1,
      },
    };

    const activeOsMine = await prisma.checklistExecution.findMany({
      where: {
        AND: [
          {
            ...ownerEmailClause,
            routineTaskNumber: null,
            status: { in: ['PENDING', 'RECEIVED', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED'] },
          },
          executionBelongsToJwtTenant,
        ],
      },
      include: { template: true, ...revInclude },
    });

    const activeOsBroadcastOpen = await prisma.checklistExecution.findMany({
      where: {
        AND: [
          {
            assignmentMode: 'BROADCAST',
            claimStatus: 'OPEN',
            routineTaskNumber: null,
            ownerEmail: null,
            status: { in: ['PENDING', 'RECEIVED', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED'] },
          },
          executionBelongsToJwtTenant,
        ],
      },
      include: { template: true, ...revInclude },
    });
    const activeOsBroadcastMine = activeOsBroadcastOpen.filter((row) => {
      const arr = broadcastCandidateArray(row.broadcastCandidates);
      return ownerCandidates.some((c) => {
        const n = normalizeSyncEmail(c);
        return n && arr.includes(n);
      });
    });

    const seenFt = new Set();
    const activeOs = [];
    for (const row of [...activeOsMine, ...activeOsBroadcastMine]) {
      if (seenFt.has(row.id)) continue;
      seenFt.add(row.id);
      activeOs.push(row);
    }

    const activeRt = await prisma.checklistExecution.findMany({
      where: {
        AND: [
          {
            ...ownerEmailClause,
            routineTaskNumber: { not: null },
            status: { in: ['PENDING', 'RECEIVED', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED'] },
          },
          executionBelongsToJwtTenant,
        ],
      },
      orderBy: [{ createdAt: 'asc' }],
      include: { template: true, ...revInclude },
    });

    const doneOs = await prisma.checklistExecution.findMany({
      where: {
        AND: [
          {
            ...ownerEmailClause,
            routineTaskNumber: null,
            status: { in: ['COMPLETED', 'SYNCED'] },
          },
          executionBelongsToJwtTenant,
        ],
      },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      take: 400,
      include: { template: true, ...revInclude },
    });

    const doneRt = await prisma.checklistExecution.findMany({
      where: {
        AND: [
          {
            ...ownerEmailClause,
            routineTaskNumber: { not: null },
            status: { in: ['COMPLETED', 'SYNCED'] },
          },
          executionBelongsToJwtTenant,
        ],
      },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: { template: true, ...revInclude },
    });

    const cancelledRt = await prisma.checklistExecution.findMany({
      where: {
        AND: [
          {
            ...ownerEmailClause,
            routineTaskNumber: { not: null },
            status: { in: ['CANCELLED', 'CANCELED'] },
          },
          executionBelongsToJwtTenant,
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
      include: { template: true, ...revInclude },
    });

    const seen = new Set();
    const merged = [];
    for (const e of [...activeOs, ...activeRt, ...doneOs, ...doneRt, ...cancelledRt]) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      merged.push(e);
    }

    let suppressPartnerBroadcast = false;
    try {
      suppressPartnerBroadcast = await isAppUserInDedicatedExclusiveAt(prisma, req.user.id, new Date());
    } catch (e) {
      console.warn('[sync/tasks] dedicated exclusive', e && e.message);
    }

    const userTasks = merged.map(mapChecklistExecutionToSyncTask).map((task) => {
      if (!suppressPartnerBroadcast || !task.broadcastClaimPending) return task;
      const next = { ...task, broadcastClaimPending: false, broadcastClaimExpiresAt: null };
      if (next.metadata && typeof next.metadata === 'object') {
        next.metadata = { ...next.metadata };
        delete next.metadata.broadcastClaimExpiresAt;
      }
      return next;
    });

    console.log(
      `[sync/tasks] ✅ ${ownerEmail} → OS ativas ${activeOs.length} + RT ativas ${activeRt.length} + concl./sync OS ${doneOs.length} + RT ${doneRt.length} + RT cancel. ${cancelledRt.length} → ${userTasks.length} no payload${suppressPartnerBroadcast ? ' (ofertas broadcast suprimidas — janela vínculo dedicado)' : ''}`
    );
    res.json(userTasks);
  } catch (err) {
    console.error('[sync/tasks]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/tech-stock/movements/search ───────────────────────────────
// Histórico pesquisável (também em sync.js porque este router é montado antes de sync-modules).
router.get('/tech-stock/movements/search', techStockMovementsSearchHandler);

module.exports = router;
