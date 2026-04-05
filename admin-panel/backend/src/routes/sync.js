'use strict';
const router  = require('express').Router();
const prisma  = require('../db');
const authUser = require('../middleware/authUser');
const { recordSync } = require('../services/cockpitMetrics');

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
            break;
          }
          case 'DELETE_ASSET': {
            await prisma.asset.updateMany({
              where: { id: p.id, tenantId },
              data: { deletedAt: new Date() },
            });
            break;
          }
          default:
            console.log(`[sync/push] Ação desconhecida: ${item.action}`);
        }

        processed++;
        processedIds.push(item.id || p.id); // Guardar info para o frontend limpar
        const payloadSize = item.payload ? JSON.stringify(item.payload).length : 0;
        recordSync(userId, true, payloadSize);
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
// Retorna catálogo global de prestadores de serviço (fonte: PostgreSQL)
// O app salva no SQLite local para uso offline
router.get('/providers', async (_req, res) => {
  try {
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
      orderBy: { type: 'asc' },
    });

    const assetTypes = metatags.filter(m => m.type === 'ASSET_TYPE').map(m => ({
      id:        m.key,
      titleKey:  m.translations?.['pt-BR'] || m.key,
      subtitleKey: m.translations?.['en-US'] || m.key,
      icon:      m.icon || 'cube-outline',
      color:     m.color || '#6366F1',
    }));

    const categories = metatags.filter(m => m.type === 'CATEGORY').map(m => ({
      id:    m.key,
      label: m.translations?.['pt-BR'] || m.key,
      icon:  m.icon || 'grid-outline',
    }));

    res.json({ assetTypes, categories, updatedAt: new Date() });
  } catch (err) {
    console.error('[sync/config]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sync/tasks ──────────────────────────────────────────────────────
// Fetch active tasks for the mobile app (PENDING + IN_PROGRESS).
// Side-effect: PENDING tasks are promoted to IN_PROGRESS on first pull,
// which moves them from "Pendentes" → "Em Campo" in the admin Kanban.
router.get('/tasks', async (req, res) => {
  try {
    const ownerEmail = req.query.owner_email || req.user?.email;
    if (!ownerEmail) return res.status(400).json({ error: 'owner_email obrigatório.' });

    // Fetch all active tasks
    const activeExecs = await prisma.checklistExecution.findMany({
        where: { ownerEmail, status: { in: ['PENDING', 'RECEIVED', 'ACCEPTED', 'IN_PROGRESS'] } },
        include: { template: true }
    });

    const userTasks = activeExecs.map(ex => {
        let meta = ex.metadata || {};
        if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e){} }

        const refId       = meta.refId || ex.templateId || null;
        const title       = meta.title       || ex.template?.title       || 'Nova OS Designada';
        const description = meta.description || ex.template?.description || 'Tarefa de rotina despachada.';

        return {
            id: ex.id, refId, ownerEmail: ex.ownerEmail,
            category: "TASK",
            startDate: ex.createdAt,
            endDate: new Date(new Date(ex.createdAt).getTime() + 86400000),
            isAllDay: true, source: "CHECKLIST",
            metadata: meta, title, description,
            status: ex.status,
            // Geofencing location
            locationLat:      ex.locationLat      || null,
            locationLng:      ex.locationLng      || null,
            locationRadius:   ex.locationRadius   || null,
            locationAddress:  ex.locationAddress  || null,
            locationZoneType: ex.locationZoneType || null,
            locationPolygon:  ex.locationPolygon  || null,
            etaMinutes:       ex.etaMinutes       || null,
        };
    });

    console.log(`[sync/tasks] ✅ ${ownerEmail} → ${userTasks.length} OS(s) ativas`);
    res.json(userTasks);
  } catch (err) {
    console.error("[sync/tasks]", err);
    res.status(500).json({ error: err.message });
  }
});



module.exports = router;

