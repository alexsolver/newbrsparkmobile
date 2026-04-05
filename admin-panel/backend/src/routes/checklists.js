const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const prisma = require('../db');
const authUser = require('../middleware/authUser');
const { adminAuth } = require('../middleware/auth');
const { recordSync } = require('../services/cockpitMetrics');
const { sendExpoPushToMany } = require('../services/expoPush');

function sameOwnerEmail(execEmail, jwtEmail) {
  if (!execEmail || !jwtEmail) return false;
  return String(execEmail).trim().toLowerCase() === String(jwtEmail).trim().toLowerCase();
}

// Imagens nas instruções rich-text do Form Builder (painel admin autenticado)
router.post('/help-image', adminAuth, async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      return res.status(400).json({ error: 'fileBase64 é obrigatório.' });
    }
    const b64 = String(fileBase64).replace(/\s/g, '');
    let buf;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch (e) {
      return res.status(400).json({ error: 'Base64 da imagem inválido.' });
    }
    if (buf.length > 2_500_000) {
      return res.status(400).json({ error: 'Imagem muito grande (máx. ~2,5 MB).' });
    }
    if (buf.length < 32) {
      return res.status(400).json({ error: 'Arquivo inválido.' });
    }
    let ext = 'jpg';
    const mt = String(mimeType || '').toLowerCase();
    if (mt.includes('png')) ext = 'png';
    else if (mt.includes('webp')) ext = 'webp';
    else if (mt.includes('gif')) ext = 'gif';
    else if (mt.includes('heic') || mt.includes('heif')) ext = 'heic';
    const dir = path.join(__dirname, '../../public/uploads/checklist-help');
    await fs.mkdir(dir, { recursive: true });
    const fname = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
    await fs.writeFile(path.join(dir, fname), buf);
    const url = `/uploads/checklist-help/${fname}`;
    res.json({ url });
  } catch (err) {
    console.error('[checklists/help-image]', err);
    res.status(500).json({ error: err.message || 'Falha no upload.' });
  }
});

// --- Checklist Templates (O Construtor Salva Aqui, O Celular Lê Daqui) ---

// GET /api/checklists/templates (Mobile puxa os modelos)
router.get('/templates', async (req, res) => {
    try {
        const templates = await prisma.checklistTemplate.findMany({
            where: { isActive: true },
            orderBy: { updatedAt: 'desc' }
        });
        res.json(templates);
    } catch (err) {
        console.error("GET /api/checklists/templates error:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/checklists/templates/:id (Mobile puxa um modelo específico se não tiver cache)
router.get('/templates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const template = await prisma.checklistTemplate.findUnique({
            where: { id }
        });
        if (!template) return res.status(404).json({ error: 'Template não encontrado.' });
        res.json(template);
    } catch (err) {
        console.error("GET /api/checklists/templates/:id error:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/checklists/templates (Admin Panel salva um schema)
router.post('/templates', async (req, res) => {
    try {
        const { id, title, description, settings, schemaData, metadata } = req.body;
        
        // Upsert logica para editar formulário existente se vier ID
        if(id && typeof id === 'string') {
            const existing = await prisma.checklistTemplate.findUnique({ where: { id }});
            if(existing) {
                const updated = await prisma.checklistTemplate.update({
                    where: { id },
                    data: { title, description, settings, schemaData, metadata }
                });
                return res.json(updated);
            }
        }
        
        const created = await prisma.checklistTemplate.create({
            data: { 
                id: id && typeof id === 'string' ? id : undefined, 
                title, 
                description, 
                settings: settings || {}, 
                schemaData: schemaData || [],
                metadata: metadata || {} 
            }
        });
        res.json(created);
    } catch (err) {
        console.error("POST /api/checklists/templates error:", err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/checklists/templates/:id (Admin Panel deleta logicamente um schema)
router.delete('/templates/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await prisma.checklistTemplate.update({
            where: { id },
            data: { isActive: false }
        });
        res.json({ success: true, id: deleted.id });
    } catch (err) {
        console.error("DELETE /api/checklists/templates error:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- Execuções (O Celular Descarrega o Outbox Aqui) ---


// GET /api/checklists/executions/:taskId (app: JWT + dono da OS)
router.get('/executions/:taskId', authUser, async (req, res) => {
    try {
        const { taskId } = req.params;
        const exec = await prisma.checklistExecution.findFirst({
            where: { id: taskId }
        });
        if (!exec) return res.status(404).json({ error: 'Execução não encontrada' });
        if (!sameOwnerEmail(exec.ownerEmail, req.user.email)) {
            return res.status(403).json({ error: 'Acesso negado a esta execução.' });
        }
        res.json(exec);
    } catch (err) {
        console.error("GET /api/checklists/executions/:taskId error:", err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/checklists/executions/:taskId/status -> Real-time PING + rascunho (app: JWT + dono)
router.patch('/executions/:taskId/status', authUser, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { status, timestamp, responses } = req.body;
        
        const existing = await prisma.checklistExecution.findUnique({ where: { id: taskId } });
        if (!existing) return res.status(404).json({ error: "OS não encontrada" });
        if (!sameOwnerEmail(existing.ownerEmail, req.user.email)) {
            return res.status(403).json({ error: 'Acesso negado a esta OS.' });
        }

        const ts = timestamp ? new Date(timestamp) : new Date();
        const updateData = {};
        
        const weights = { 'PENDING': 0, 'RECEIVED': 1, 'ACCEPTED': 2, 'IN_PROGRESS': 3, 'COMPLETED': 4, 'SYNCED': 5, 'CANCELLED': 99 };
        const newW = weights[status] || 0;
        const oldW = weights[existing.status] || 0;

        // Somente atualize o status se ele avança o state machine (ou é lateral)
        if (newW >= oldW) {
            updateData.status = status;
        }

        if (status === 'RECEIVED') {
           updateData.metadata = { ...(typeof existing.metadata === 'object' && existing.metadata ? existing.metadata : {}), receivedAt: ts };
        } else if (status === 'ACCEPTED') {
           updateData.metadata = { ...(typeof existing.metadata === 'object' && existing.metadata ? existing.metadata : {}), acceptedAt: ts };
        } else if (status === 'IN_PROGRESS') {
           if (!existing.startedAt) updateData.startedAt = ts;
        }

        if (responses) {
            updateData.responses = responses;
        }

        const execution = await prisma.checklistExecution.update({
            where: { id: taskId },
            data: updateData
        });
        
        res.json({ ok: true, id: execution.id, status: execution.status });
    } catch (err) {
        console.error("PATCH /executions/:taskId/status error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/executions', authUser, async (req, res) => {
    try {
        const { id, taskId, templateId, ownerEmail, assetId, responses, metadata, gpsLocation, startedAt, completedAt } = req.body;
        const authEmail = req.user.email;
        
        let execution;
        let finalTemplateId = templateId || id;
        
        // If the task was dispatched from the cloud, the mobile app sends taskId. 
        // We update the existing PENDING execution instead of creating a new one!
        if (taskId) {
            const existing = await prisma.checklistExecution.findUnique({ where: { id: taskId } });
            if (existing) {
                if (!sameOwnerEmail(existing.ownerEmail, authEmail)) {
                    return res.status(403).json({ error: 'Acesso negado a esta OS.' });
                }
                execution = await prisma.checklistExecution.update({
                    where: { id: taskId },
                    data: {
                        status: 'COMPLETED',
                        responses: responses || {},
                        metadata: {
                            ...(typeof existing.metadata === 'object' && existing.metadata ? existing.metadata : {}),
                            ...(metadata || {})
                        },
                        gpsLocation: gpsLocation || null,
                        startedAt: startedAt ? new Date(startedAt) : existing.startedAt,
                        completedAt: completedAt ? new Date(completedAt) : new Date(),
                        syncedAt: new Date()
                    }
                });
            }
        }
        
        // Fallback: This is an ad-hoc local checklist execution not dispatched from the cloud. Create it.
        if (!execution) {
            const resolvedOwner =
              ownerEmail && sameOwnerEmail(ownerEmail, authEmail) ? ownerEmail : authEmail;
            execution = await prisma.checklistExecution.create({
                data: {
                    templateId: finalTemplateId,
                    ownerEmail: resolvedOwner || 'unknown@owner.com',
                    assetId: assetId || null,
                    status: 'COMPLETED',             // Já chega consolidado do Outbox
                    responses: responses || {},
                    metadata: metadata || {},
                    gpsLocation: gpsLocation || null,
                    startedAt: startedAt ? new Date(startedAt) : null,
                    completedAt: completedAt ? new Date(completedAt) : new Date(),
                    syncedAt: new Date()
                }
            });
        }
        
        // Registra o Audit Log robusto garantindo integridade e rastreabilidade da OS fechada.
        await prisma.auditLog.create({
            data: {
                action: 'SYNC_OS_COMPLETED',
                resource: 'ChecklistExecution',
                category: 'DATA',
                metadata: { 
                    executionId: execution.id, 
                    templateId: execution.templateId,
                    ownerEmail: execution.ownerEmail,
                    hasGps: !!gpsLocation
                }
            }
        });
        
        // Registrar sucesso no Cockpit!
        const payloadSize = JSON.stringify(req.body).length;
        recordSync(execution.ownerEmail || authEmail, true, payloadSize);
        
        res.json({ success: true, executionId: execution.id });
    } catch(err) {
        console.error("POST /api/checklists/executions error:", err);
        const ownerEmail = req.body?.ownerEmail || 'unknown';
        recordSync(ownerEmail, false, 0, err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/checklists/dispatch (Admin Panel despacha um form)
router.post('/dispatch', async (req, res) => {
    try {
        const payload = req.body;
        if (!payload || !payload.ownerEmail || !payload.refId) {
            return res.status(400).json({ error: "ownerEmail and refId are required" });
        }
        
        // Try to find the real template to get title/description
        let templateTitle = payload.title || 'Nova OS Designada';
        let templateDesc = payload.description || 'Tarefa de rotina despachada.';
        let realTemplateId = null;
        
        try {
            const template = await prisma.checklistTemplate.findUnique({ where: { id: payload.refId } });
            if (template) {
                realTemplateId = template.id;
                templateTitle = template.title;
                templateDesc = template.description || templateDesc;
            }
        } catch(e) { /* template not found is OK for ad-hoc */ }

        // Cada dispatch cria uma OS independente — sem deduplicação automática.
        // Admin pode cancelar OS via Central de Operações se necessário.


        const execution = await prisma.checklistExecution.create({
            data: {
                templateId: realTemplateId,    // nullable FK — ok if null
                ownerEmail: payload.ownerEmail,
                status: 'PENDING',
                responses: null,               // deliberately empty until tech fills it
                // Geofencing Location
                locationLat:      payload.locationLat      ? parseFloat(payload.locationLat)  : null,
                locationLng:      payload.locationLng      ? parseFloat(payload.locationLng)  : null,
                locationRadius:   payload.locationRadius   ? parseInt(payload.locationRadius) : null,
                locationAddress:  payload.locationAddress  || null,
                locationZoneType: payload.locationZoneType || null,
                locationPolygon:  payload.locationPolygon  || null,
                metadata: {
                    ...(payload.metadata || {}),
                    refId: payload.refId,      // keep original for mobile to load schema
                    title: templateTitle,
                    description: templateDesc
                }
            }
        });
        
        console.log(`[DISPATCH] 📍 locationZoneType=${execution.locationZoneType} | polygon.length=${Array.isArray(execution.locationPolygon) ? execution.locationPolygon.length : 'null'} | lat=${execution.locationLat}`);
        
        // ─── Push se o técnico tiver token (channelId Android = brspark-alerts) ───
        try {
            const user = await prisma.user.findUnique({ where: { email: payload.ownerEmail.toLowerCase() } });
            if (user) {
                const pushTokens = await prisma.pushToken.findMany({ where: { userId: user.id } });
                if (pushTokens.length > 0) {
                    await sendExpoPushToMany(pushTokens, {
                        title: 'Nova OS designada',
                        body: templateTitle || 'Você recebeu uma nova atividade',
                        data: { taskId: execution.id },
                    });
                    console.log(`[DISPATCH] Push enviado para ${pushTokens.length} dispositivo(s).`);
                }
            }
        } catch (pushErr) {
            console.error('[DISPATCH] Falha ao enviar push:', pushErr.message);
        }
        
        res.json({ success: true, task: { id: execution.id, refId: payload.refId } });
    } catch (err) {
        console.error("POST /api/checklists/dispatch error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
