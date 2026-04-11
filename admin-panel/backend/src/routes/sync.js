'use strict';
const router  = require('express').Router();
const prisma  = require('../db');
const authUser = require('../middleware/authUser');
const { recordSync } = require('../services/cockpitMetrics');
const { effectiveLastSubmittedRevision } = require('../lib/effectiveExecutionRevision');
const techStockMovementsSearchHandler = require('../lib/techStockMovementsSearchHandler');
const { isActiveTechnicianForEmail } = require('../lib/technicianEligibility');

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
// Retorna todos os bens do tenant do usuário logado (para o app sincronizar)
router.get('/assets', async (req, res) => {
  try {
    const { tenantId, email } = req.user;
    
    // Buscar quais ativos foram compartilhados com este e-mail e ainda estão na validade
    const shares = await prisma.assetShare.findMany({
      where: { 
        sharedWithEmail: email.toLowerCase(), 
        status: 'ACCEPTED',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      select: { assetId: true, permission: true }
    });
    const sharedAssetIds = shares.map(s => s.assetId);

    // Buscar os bens (os do próprio tenant + os compartilhados explicitamente)
    let assets = await prisma.asset.findMany({
      where: { 
        OR: [
          { tenantId, deletedAt: null },
          { id: { in: sharedAssetIds }, deletedAt: null }
        ]
      },
      include: {
        location: true,
        stockItems: true,
        children: { select: { id: true } },
        parent: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Injetar _isShared no details e formatar a saída final
    assets = assets.map(asset => {
      if (sharedAssetIds.includes(asset.id) && asset.tenantId !== tenantId) {
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
    const { tenantId, id: userId } = req.user;
    const { queue = [] } = req.body;

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
            if (safeType === 'VEHICLE') safeType = 'TERRESTRIAL'; // Intercept corrupt mobile sync queue

            await prisma.asset.upsert({
              where: { id: p.id },
              create: {
                id: p.id,
                tenantId,
                title:    p.title,
                type:     safeType,
                status:   p.status || 'OPERATIONAL',
                imageUrl: p.imageUrl || null,
                parentId: p.parentId || null,
                metadata: p.details || {},
              },
              update: {
                title:    p.title,
                status:   p.status || 'OPERATIONAL',
                imageUrl: p.imageUrl || null,
                parentId: p.parentId || null,
                metadata: p.details || {},
              },
            });
            handled = true;
            break;
          }
          case 'DELETE_ASSET': {
            await prisma.asset.updateMany({
              where: { id: p.id, tenantId },
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
    const { tenantId } = req.user;
    const p = req.body;

    const asset = await prisma.asset.upsert({
      where: { id: p.id || '__new__' },
      create: {
        tenantId,
        title:    p.title,
        type:     p.type || 'OTHER',
        status:   p.status || 'OPERACIONAL',
        imageUrl: p.imageUrl || null,
        parentId: p.parentId || null,
        metadata: p.details || {},
      },
      update: {
        title:    p.title,
        status:   p.status,
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

function mapChecklistExecutionToSyncTask(ex) {
  let meta = ex.metadata || {};
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch (e) {
      meta = {};
    }
  }

  const refId = meta.refId || ex.templateId || null;
  const title = meta.title || ex.template?.title || 'Nova OS Designada';
  const templateTitle =
    (meta.templateTitle != null && String(meta.templateTitle).trim()) ||
    ex.template?.title ||
    null;
  const description = meta.description || ex.template?.description || 'Tarefa de rotina despachada.';

  const isDone = ['COMPLETED', 'SYNCED'].includes(String(ex.status || '').toUpperCase());
  const anchorDate = isDone && ex.completedAt ? ex.completedAt : ex.createdAt;

  return {
    id: ex.id,
    osNumber: ex.osNumber || null,
    lastSubmittedRevision: effectiveLastSubmittedRevision(
      ex.lastSubmittedRevision,
      ex.revisions?.[0]?.revision
    ),
    refId,
    ownerEmail: ex.ownerEmail,
    category: 'TASK',
    startDate: anchorDate,
    endDate: new Date(new Date(anchorDate).getTime() + 86400000),
    isAllDay: true,
    source: 'CHECKLIST',
    metadata: meta,
    title,
    templateTitle,
    description,
    status: ex.status,
    locationLat: ex.locationLat || null,
    locationLng: ex.locationLng || null,
    locationRadius: ex.locationRadius || null,
    locationAddress: ex.locationAddress || null,
    locationZoneType: ex.locationZoneType || null,
    locationPolygon: ex.locationPolygon || null,
    etaMinutes: ex.etaMinutes || null,
  };
}

// ─── GET /api/sync/tasks ──────────────────────────────────────────────────────
// OS ativas (pendentes / em campo) + concluídas recentes no servidor (para aba "Concluídas"
// sem depender só do AsyncStorage local do celular).
router.get('/tasks', async (req, res) => {
  try {
    const jwtEmail = String(req.user?.email || '').trim();
    const qEmail = String(req.query.owner_email || '').trim();
    if (qEmail && qEmail.toLowerCase() !== jwtEmail.toLowerCase()) {
      return res.status(403).json({ error: 'owner_email não coincide com o usuário autenticado.' });
    }
    const ownerEmail = qEmail || jwtEmail;
    if (!ownerEmail) return res.status(400).json({ error: 'owner_email obrigatório.' });

    const tenantId = String(req.user?.tenantId || '').trim();
    const canReceiveOs = await isActiveTechnicianForEmail(prisma, ownerEmail, tenantId);
    if (!canReceiveOs) {
      console.log(`[sync/tasks] ${ownerEmail} — sem prestador ativo no tenant; retorno vazio.`);
      return res.json([]);
    }

    const ownerWhere = { equals: ownerEmail, mode: 'insensitive' };

    const revInclude = {
      revisions: {
        select: { revision: true },
        orderBy: { revision: 'desc' },
        take: 1,
      },
    };

    const activeExecs = await prisma.checklistExecution.findMany({
      where: {
        ownerEmail: ownerWhere,
        status: { in: ['PENDING', 'RECEIVED', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED'] },
      },
      include: { template: true, ...revInclude },
    });

    const doneExecs = await prisma.checklistExecution.findMany({
      where: {
        ownerEmail: ownerWhere,
        status: { in: ['COMPLETED', 'SYNCED'] },
      },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      take: 400,
      include: { template: true, ...revInclude },
    });

    const seen = new Set(activeExecs.map((e) => e.id));
    const merged = [...activeExecs, ...doneExecs.filter((e) => !seen.has(e.id))];

    const userTasks = merged.map(mapChecklistExecutionToSyncTask);

    console.log(
      `[sync/tasks] ✅ ${ownerEmail} → ${activeExecs.length} ativa(s) + ${doneExecs.length} concl./sync → ${userTasks.length} no payload`
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

