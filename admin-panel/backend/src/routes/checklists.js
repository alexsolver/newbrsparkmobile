const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();
const prisma = require('../db');
const authUser = require('../middleware/authUser');
const { adminAuthThenPanel } = require('../middleware/auth');
const { recordSync } = require('../services/cockpitMetrics');
const { sendFieldTaskActivityPushToAssignee } = require('../lib/fieldTaskAssigneePush');
const { allocateNextFtOsNumber } = require('../lib/ftOsNumber');
const { createNextRoutineTaskAfterComplete } = require('../lib/routineTaskLifecycle');
const { stripRevisionSessionEvidenceInPlace } = require('../lib/revisionSessionFields');
const {
    normalizeTemplateTitle,
    findActiveDuplicateInFolder,
} = require('../lib/templateTitleUnique');
const { computeExecutionBusinessMetrics } = require('../lib/executionBusinessMetrics');
const { resolveFieldTaskAssigneeEmail } = require('../lib/technicianEligibility');
const { validateChecklistTransitDisplacement } = require('../lib/checklistTransitRules');
const {
    resolveSnapshotExpectedFormDurationMinutes,
    parseScheduledStartAt,
    normalizeExpectedFormDurationMinutes,
} = require('../lib/formDurationPolicy');
const { scheduleChecklistTemplateEmbeddingSync } = require('../lib/formAiChecklistTemplateEmbed');
const { consumeQuota, assertChecklistTemplateCapacity } = require('../lib/planQuotaService');

const DUPLICATE_TEMPLATE_TITLE_PT =
    'Já existe um formulário ativo com este nome nesta pasta. Escolha outro título ou pasta.';

/**
 * Pausa de deslocamento (link público) só deve mudar com POST /api/tracking/pause|resume.
 * O app reenvia `metadata` em cache ao sincronizar; `trackingPaused: true` velho sobrescrevia
 * o `false` gravado no resume e o cliente via o link «preso» em pausa.
 */
function stripClientTrackingDisplacementFields(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return;
    delete meta.trackingPaused;
    delete meta.trackingPausedAt;
}

/** `executionPaused: false` vindo do app (JSON às vezes chega como string em clientes antigos). */
function isExecutionPausedFalseish(v) {
    if (v === false || v === 0) return true;
    if (v === 'false' || v === '0') return true;
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'false' || s === '0';
}

function execMetaReopenRevisionPending(m) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
    const r = m.reopenForRevisionPending;
    return r === true || r === 'true' || String(r ?? '').toLowerCase() === 'true';
}

function execMetaRevisionVisitActive(m) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
    const r = m.revisionVisitActive;
    return r === true || r === 'true' || String(r ?? '').toLowerCase() === 'true';
}

function execMetaInOpenRevisionVisit(m) {
    return execMetaReopenRevisionPending(m) || execMetaRevisionVisitActive(m);
}

function sameOwnerEmail(execEmail, jwtEmail) {
  if (!execEmail || !jwtEmail) return false;
  return String(execEmail).trim().toLowerCase() === String(jwtEmail).trim().toLowerCase();
}

// Imagens nas instruções rich-text do Form Builder (painel admin autenticado)
router.post('/help-image', adminAuthThenPanel, async (req, res) => {
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

// --- Pastas de modelos (Form Builder → "Meus formulários") ---
router.get('/template-folders', async (req, res) => {
  try {
    const rows = await prisma.checklistTemplateFolder.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(rows);
  } catch (err) {
    console.error('GET /checklists/template-folders', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/template-folders', async (req, res) => {
  try {
    const { name, parentId } = req.body;
    if (!name || typeof name !== 'string' || !String(name).trim()) {
      return res.status(400).json({ error: 'Nome da pasta é obrigatório.' });
    }
    let parentIdNorm =
      parentId == null || parentId === '' ? null : String(parentId);
    if (parentIdNorm) {
      const p = await prisma.checklistTemplateFolder.findUnique({
        where: { id: parentIdNorm },
      });
      if (!p) {
        return res.status(400).json({ error: 'Pasta pai não encontrada.' });
      }
    }
    const row = await prisma.checklistTemplateFolder.create({
      data: {
        name: String(name).trim(),
        parentId: parentIdNorm,
      },
    });
    res.json(row);
  } catch (err) {
    console.error('POST /checklists/template-folders', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/template-folders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !String(name).trim()) {
      return res.status(400).json({ error: 'Nome inválido.' });
    }
    const row = await prisma.checklistTemplateFolder.update({
      where: { id },
      data: { name: String(name).trim() },
    });
    res.json(row);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Pasta não encontrada.' });
    }
    console.error('PATCH /checklists/template-folders/:id', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/template-folders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.checklistTemplateFolder.delete({ where: { id } });
    res.json({ success: true, id });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Pasta não encontrada.' });
    }
    console.error('DELETE /checklists/template-folders/:id', err);
    res.status(500).json({ error: err.message });
  }
});

/** Mover modelo para outra pasta (dropdown no modal) */
router.patch('/templates/:id/folder', async (req, res) => {
  try {
    const { id } = req.params;
    let { folderId } = req.body;
    if (folderId === '' || folderId === undefined) folderId = null;
    else folderId = String(folderId);
    if (folderId) {
      const fo = await prisma.checklistTemplateFolder.findUnique({
        where: { id: folderId },
      });
      if (!fo) {
        return res.status(400).json({ error: 'Pasta de destino não encontrada.' });
      }
    }
    const tpl = await prisma.checklistTemplate.findUnique({ where: { id } });
    if (!tpl) {
      return res.status(404).json({ error: 'Formulário não encontrado.' });
    }
    const destFolderId = folderId === null || folderId === undefined ? null : folderId;
    const dupMove = await findActiveDuplicateInFolder(prisma, {
      folderId: destFolderId,
      title: tpl.title,
      excludeId: id,
    });
    if (dupMove) {
      return res.status(409).json({ error: DUPLICATE_TEMPLATE_TITLE_PT });
    }
    const updated = await prisma.checklistTemplate.update({
      where: { id },
      data: { folderId: destFolderId },
    });
    res.json(updated);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Formulário não encontrado.' });
    }
    console.error('PATCH /checklists/templates/:id/folder', err);
    res.status(500).json({ error: err.message });
  }
});

/** Pré-definições de opções para campo `lookup_select` (app: GET com JWT). */
const LOOKUP_OPTION_PRESETS = {
  equipamentos_demo: [
    { value: 'bomba_01', label: 'Bomba hidráulica #01' },
    { value: 'motor_a', label: 'Motor principal A' },
    { value: 'painel_e2', label: 'Painel elétrico E2' },
  ],
  tecnicos_demo: [
    { value: 'equipa_a', label: 'Equipe A — manutenção' },
    { value: 'equipa_b', label: 'Equipe B — inspeção' },
  ],
  prioridades_demo: [
    { value: 'crit', label: 'Crítica' },
    { value: 'alta', label: 'Alta' },
    { value: 'media', label: 'Média' },
    { value: 'baixa', label: 'Baixa' },
  ],
};

// GET /api/checklists/lookup-options/:preset — opções para lista dinâmica (lookup_select)
router.get('/lookup-options/:preset', authUser, (req, res) => {
  try {
    const key = String(req.params.preset || '').trim();
    const list = LOOKUP_OPTION_PRESETS[key];
    if (!Array.isArray(list)) {
      return res.status(404).json({
        error:
          'Preset não encontrado. Valores: equipamentos_demo, tecnicos_demo, prioridades_demo.',
        options: [],
      });
    }
    res.json({ preset: key, options: list });
  } catch (err) {
    console.error('[checklists/lookup-options]', err);
    res.status(500).json({ error: err.message || 'Erro ao carregar opções.' });
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
        const { id, title, description, metadata } = req.body;
        let { settings, schemaData, folderId } = req.body;
        if (typeof schemaData === 'string') {
            try {
                schemaData = JSON.parse(schemaData);
            } catch {
                schemaData = [];
            }
        }
        if (!Array.isArray(schemaData)) schemaData = [];

        if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
            settings = { ...settings };
            if (Object.prototype.hasOwnProperty.call(settings, 'expectedFormDurationMinutes')) {
                const n = normalizeExpectedFormDurationMinutes(settings.expectedFormDurationMinutes, {
                    allowNull: true,
                });
                if (n == null) delete settings.expectedFormDurationMinutes;
                else settings.expectedFormDurationMinutes = n;
            }
        }

        const transitErr = validateChecklistTransitDisplacement(schemaData);
        if (transitErr) {
            return res.status(400).json({ error: transitErr });
        }

        let folderIdNorm =
            folderId === undefined ? undefined : folderId === '' || folderId === null ? null : String(folderId);
        if (folderIdNorm) {
            const fo = await prisma.checklistTemplateFolder.findUnique({
                where: { id: folderIdNorm },
            });
            if (!fo) {
                return res.status(400).json({ error: 'Pasta (folderId) não encontrada.' });
            }
        }

        // Upsert logica para editar formulário existente se vier ID
        if (id && typeof id === 'string') {
            const existing = await prisma.checklistTemplate.findUnique({ where: { id } });
            if (existing) {
                const rawTitleUp =
                    title !== undefined && title !== null ? String(title) : String(existing.title ?? '');
                const normTitleUp = normalizeTemplateTitle(rawTitleUp);
                if (!normTitleUp) {
                    return res.status(400).json({ error: 'O título do formulário não pode estar vazio.' });
                }
                const effectiveFolder =
                    folderIdNorm !== undefined ? folderIdNorm : existing.folderId ?? null;
                const dupUp = await findActiveDuplicateInFolder(prisma, {
                    folderId: effectiveFolder,
                    title: normTitleUp,
                    excludeId: id,
                });
                if (dupUp) {
                    return res.status(409).json({ error: DUPLICATE_TEMPLATE_TITLE_PT });
                }
                const updateData = {
                    title: normTitleUp,
                    description,
                    settings,
                    schemaData,
                    metadata,
                };
                if (folderIdNorm !== undefined) updateData.folderId = folderIdNorm;
                const updated = await prisma.checklistTemplate.update({
                    where: { id },
                    data: updateData,
                });
                scheduleChecklistTemplateEmbeddingSync(updated.id);
                return res.json(updated);
            }
        }

        const titleForCreate =
            title !== undefined && title !== null ? String(title) : '';
        const normTitleCr = normalizeTemplateTitle(titleForCreate);
        if (!normTitleCr) {
            return res.status(400).json({ error: 'O título do formulário não pode estar vazio.' });
        }

        const createFolderId = folderIdNorm === undefined ? null : folderIdNorm;
        const dupCr = await findActiveDuplicateInFolder(prisma, {
            folderId: createFolderId,
            title: normTitleCr,
            excludeId: null,
        });
        if (dupCr) {
            return res.status(409).json({ error: DUPLICATE_TEMPLATE_TITLE_PT });
        }

        const tenantIdForTpl =
            (req.body && req.body.tenantId != null && String(req.body.tenantId).trim()
                ? String(req.body.tenantId).trim()
                : null) ||
            (req.query && req.query.tenantId != null && String(req.query.tenantId).trim()
                ? String(req.query.tenantId).trim()
                : null);
        if (tenantIdForTpl) {
            const cap = await assertChecklistTemplateCapacity(prisma, tenantIdForTpl);
            if (!cap.ok) {
                return res.status(403).json({ error: cap.error, code: cap.code || 'PLAN_MAX_TEMPLATES' });
            }
        }

        const created = await prisma.checklistTemplate.create({
            data: {
                id: id && typeof id === 'string' ? id : undefined,
                title: normTitleCr,
                description,
                settings: settings || {},
                schemaData,
                metadata: metadata || {},
                folderId: createFolderId,
                ...(tenantIdForTpl ? { tenantId: tenantIdForTpl } : {}),
            },
        });
        scheduleChecklistTemplateEmbeddingSync(created.id);
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
        prisma.checklistTemplateEmbedding.deleteMany({ where: { templateId: id } }).catch(() => {});
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
        const statusNorm = typeof status === 'string' ? status.trim().toUpperCase() : null;
        
        const existing = await prisma.checklistExecution.findUnique({
            where: { id: taskId },
            include: { template: true },
        });
        if (!existing) return res.status(404).json({ error: "OS não encontrada" });
        if (!sameOwnerEmail(existing.ownerEmail, req.user.email)) {
            return res.status(403).json({ error: 'Acesso negado a esta OS.' });
        }

        let existingMeta = existing.metadata;
        if (typeof existingMeta === 'string') {
            try {
                existingMeta = JSON.parse(existingMeta);
            } catch {
                existingMeta = {};
            }
        }
        const inOpenRevisionVisit = execMetaInOpenRevisionVisit(
            existingMeta && typeof existingMeta === 'object' && !Array.isArray(existingMeta) ? existingMeta : {}
        );

        const ts = timestamp ? new Date(timestamp) : new Date();
        const updateData = {};

        let mergedMeta =
            typeof existing.metadata === 'object' && existing.metadata && !Array.isArray(existing.metadata)
                ? { ...existing.metadata }
                : {};
        const reqMeta = req.body.metadata;
        if (reqMeta && typeof reqMeta === 'object' && !Array.isArray(reqMeta)) {
            const incoming = { ...reqMeta };
            stripClientTrackingDisplacementFields(incoming);
            mergedMeta = { ...mergedMeta, ...incoming };
        }

        const weights = {
            PENDING: 0,
            RECEIVED: 1,
            ACCEPTED: 2,
            IN_PROGRESS: 3,
            PAUSED: 3,
            COMPLETED: 4,
            SYNCED: 5,
            CANCELLED: 99,
        };
        const newW = statusNorm ? (weights[statusNorm] || 0) : 0;
        const oldW = weights[existing.status] || 0;

        const prevSt = String(existing.status || '').toUpperCase();
        /** Retomar atendimento → limpar pausa do link (`trackingPaused`), p.ex. OS sem destino e técnico só retoma o formulário. */
        const willInProgress =
            statusNorm === 'IN_PROGRESS' &&
            newW >= oldW &&
            (prevSt === 'PAUSED' || prevSt === 'ACCEPTED' || prevSt === 'IN_PROGRESS');
        const resumeExecFromMeta = (() => {
            if (!reqMeta || typeof reqMeta !== 'object' || Array.isArray(reqMeta)) return false;
            const ep = reqMeta.executionPaused;
            if (ep === true || ep === 1 || ep === 'true' || ep === '1' || String(ep ?? '').toLowerCase() === 'true')
                return false;
            if (isExecutionPausedFalseish(ep)) return true;
            return (
                typeof reqMeta.lastResumedAt === 'string' &&
                reqMeta.lastResumedAt.trim() !== '' &&
                ep === undefined
            );
        })();

        if (newW >= oldW && statusNorm) {
            updateData.status = statusNorm;
        }

        if (statusNorm === 'RECEIVED') {
            mergedMeta.receivedAt = ts;
            // Revisão reaberta pelo admin: após o celular confirmar recebimento, volta ao fluxo normal (Pendentes → Aceitar).
            delete mergedMeta.reopenForRevisionPending;
        } else if (statusNorm === 'ACCEPTED') {
            mergedMeta.acceptedAt = ts;
            delete mergedMeta.reopenForRevisionPending;
        } else if (statusNorm === 'IN_PROGRESS') {
            if (!existing.startedAt) updateData.startedAt = ts;
            delete mergedMeta.reopenForRevisionPending;
        } else if (statusNorm && ['COMPLETED', 'SYNCED', 'CANCELLED'].includes(statusNorm)) {
            delete mergedMeta.revisionVisitActive;
            delete mergedMeta.reopenForRevisionPending;
        }

        const clearsReopenPending =
            statusNorm && ['RECEIVED', 'ACCEPTED', 'IN_PROGRESS'].includes(statusNorm);

        if (responses && typeof responses === 'object' && !Array.isArray(responses)) {
            if (inOpenRevisionVisit && !clearsReopenPending) {
                const copy = { ...responses };
                stripRevisionSessionEvidenceInPlace(copy, existing.template?.schemaData);
                updateData.responses = copy;
            } else {
                updateData.responses = responses;
            }
        } else if (responses) {
            updateData.responses = responses;
        }

        // Pausa de atendimento: o app envia debounce só com `responses` + __form_paused_since — sem `status`.
        // Sem isto a OS ficava IN_PROGRESS na central mesmo com o técnico em pausa.
        let formPauseApplied = false;
        if (responses && typeof responses === 'object' && !Array.isArray(responses) && responses.__form_paused_since) {
            const exSt = String(existing.status || '');
            if (!['COMPLETED', 'SYNCED', 'CANCELLED'].includes(exSt)) {
                const pW = weights.PAUSED;
                if (pW >= oldW) {
                    formPauseApplied = true;
                    updateData.status = 'PAUSED';
                    mergedMeta.executionPaused = true;
                    if (!mergedMeta.lastPauseAt) mergedMeta.lastPauseAt = String(responses.__form_paused_since);
                    if (!mergedMeta.lastPauseReasonSummary) {
                        let hist = responses.__pause_history;
                        if (typeof hist === 'string') {
                            try {
                                hist = JSON.parse(hist);
                            } catch {
                                hist = null;
                            }
                        }
                        if (Array.isArray(hist)) {
                            for (let i = hist.length - 1; i >= 0; i--) {
                                const ev = hist[i];
                                if (ev && (ev.endedAt == null || ev.endedAt === '') && ev.startedAt) {
                                    mergedMeta.lastPauseReasonSummary = [ev.categoryLabel, ev.subLabel, ev.detail]
                                        .filter(Boolean)
                                        .join(' — ');
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        if ((willInProgress || resumeExecFromMeta) && !formPauseApplied) {
            delete mergedMeta.trackingPaused;
            delete mergedMeta.trackingPausedAt;
        }

        updateData.metadata = mergedMeta;

        if (
            statusNorm &&
            ['COMPLETED', 'SYNCED'].includes(statusNorm) &&
            (updateData.responses || existing.responses)
        ) {
            const finalResp =
                updateData.responses &&
                typeof updateData.responses === 'object' &&
                !Array.isArray(updateData.responses)
                    ? updateData.responses
                    : existing.responses && typeof existing.responses === 'object' && !Array.isArray(existing.responses)
                      ? existing.responses
                      : {};
            updateData.businessMetrics = computeExecutionBusinessMetrics({
                responses: finalResp,
                metadata: mergedMeta,
                execution: {
                    etaMinutes: existing.etaMinutes,
                    locationLat: existing.locationLat,
                    locationLng: existing.locationLng,
                    startedAt: updateData.startedAt ?? existing.startedAt,
                    completedAt: existing.completedAt,
                    expectedFormDurationMinutes: existing.expectedFormDurationMinutes,
                },
                revision: existing.lastSubmittedRevision,
            });
        }

        const prevStatus = String(existing.status || '').toUpperCase();
        const execution = await prisma.checklistExecution.update({
            where: { id: taskId },
            data: updateData
        });

        if (
            statusNorm === 'SYNCED' &&
            prevStatus !== 'SYNCED' &&
            String(execution.status || '').toUpperCase() === 'SYNCED'
        ) {
            const { onChecklistExecutionSynced } = require('../lib/evaluationTrigger');
            onChecklistExecutionSynced(execution.id).catch((e) =>
                console.error('[evaluationTrigger] onChecklistExecutionSynced', e)
            );
        }

        res.json({ ok: true, id: execution.id, status: execution.status });
    } catch (err) {
        console.error("PATCH /executions/:taskId/status error:", err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/executions', authUser, async (req, res) => {
    try {
        let nextRoutineTaskPayload = null;
        const { id, taskId, templateId, ownerEmail, assetId, metadata, gpsLocation, startedAt, completedAt } = req.body;
        let responses = req.body.responses;
        const authEmail = req.user.email;
        
        let execution;
        let finalTemplateId = templateId || id;
        const metaIn = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {};
        stripClientTrackingDisplacementFields(metaIn);
        const submissionId =
            typeof metaIn.submissionId === 'string' && metaIn.submissionId.trim() ? metaIn.submissionId.trim() : null;
        let clientRev = parseInt(String(metaIn.submissionRevision ?? req.body.submissionRevision ?? ''), 10);
        const completedAtD = completedAt ? new Date(completedAt) : new Date();

        /* Biometria facial pendente: após upload da foto (URL), completar verify no servidor antes de gravar a revisão. */
        if (responses && typeof responses === 'object' && !Array.isArray(responses) && req.user.tenantId && req.user.id) {
            const { cloneResponsesShallow, resolvePendingFacialAuditsOnSync } = require('../lib/facialRecognitionEngine');
            let templateForFacial = finalTemplateId;
            if (taskId && !templateForFacial) {
                const exQuick = await prisma.checklistExecution.findUnique({
                    where: { id: taskId },
                    select: { templateId: true },
                });
                templateForFacial = exQuick?.templateId || null;
            }
            if (templateForFacial) {
                responses = cloneResponsesShallow(responses);
                try {
                    const n = await resolvePendingFacialAuditsOnSync(prisma, {
                        responses,
                        templateId: templateForFacial,
                        tenantId: req.user.tenantId,
                        sessionUserId: req.user.id,
                    });
                    if (n > 0) {
                        console.log(`[checklists] Biometria pendente processada no sync: ${n} campo(s)`);
                    }
                } catch (fe) {
                    console.error('[checklists] resolvePendingFacialAuditsOnSync', fe);
                }
            }
        }
        
        // If the task was dispatched from the cloud, the mobile app sends taskId. 
        // We update the existing PENDING execution instead of creating a new one!
        if (taskId) {
            const existing = await prisma.checklistExecution.findUnique({ where: { id: taskId } });
            if (existing) {
                if (!sameOwnerEmail(existing.ownerEmail, authEmail)) {
                    return res.status(403).json({ error: 'Acesso negado a esta OS.' });
                }

                if (submissionId) {
                    const dup = await prisma.checklistExecutionRevision.findUnique({
                        where: { submissionId },
                    });
                    if (dup) {
                        return res.json({ success: true, executionId: existing.id, idempotent: true });
                    }
                }

                const lastSub = Number(existing.lastSubmittedRevision) || 0;
                const expectedNext = lastSub + 1;
                const stEx = String(existing.status || '').toUpperCase();

                if (!Number.isFinite(clientRev) || clientRev < 1) {
                    if (lastSub === 0) {
                        clientRev = 1;
                    } else if (['COMPLETED', 'SYNCED'].includes(stEx)) {
                        const hasLastRev = await prisma.checklistExecutionRevision.findUnique({
                            where: {
                                executionId_revision: { executionId: taskId, revision: lastSub },
                            },
                        });
                        if (hasLastRev) {
                            return res.json({ success: true, executionId: existing.id, idempotent: true });
                        }
                        return res.status(400).json({
                            error: 'Estado da execução inconsistente (revisão ausente). Entre em contato com o suporte.',
                            lastSubmittedRevision: lastSub,
                        });
                    } else {
                        clientRev = lastSub + 1;
                    }
                }

                const existingRev = await prisma.checklistExecutionRevision.findUnique({
                    where: {
                        executionId_revision: { executionId: taskId, revision: clientRev },
                    },
                });
                if (existingRev) {
                    return res.json({ success: true, executionId: existing.id, idempotent: true });
                }

                if (clientRev !== expectedNext) {
                    return res.status(422).json({
                        error: 'revision_mismatch',
                        expectedNext,
                        lastSubmittedRevision: lastSub,
                    });
                }

                const existingMeta =
                    typeof existing.metadata === 'object' && existing.metadata && !Array.isArray(existing.metadata)
                        ? { ...existing.metadata }
                        : {};

                const mergedExecutionMeta = (() => {
                    const nm = { ...existingMeta, ...metaIn };
                    delete nm.revisionVisitActive;
                    delete nm.reopenForRevisionPending;
                    return nm;
                })();
                const finalStartedAt = startedAt ? new Date(startedAt) : existing.startedAt;
                const businessSnap = computeExecutionBusinessMetrics({
                    responses: responses || {},
                    metadata: mergedExecutionMeta,
                    execution: {
                        etaMinutes: existing.etaMinutes,
                        locationLat: existing.locationLat,
                        locationLng: existing.locationLng,
                        startedAt: finalStartedAt,
                        completedAt: completedAtD,
                        expectedFormDurationMinutes: existing.expectedFormDurationMinutes,
                    },
                    revision: clientRev,
                });

                const shouldSpawnNextRoutine =
                    !!existing.routineTaskNumber && lastSub === 0 && clientRev === 1;

                execution = await prisma.$transaction(async (tx) => {
                    await tx.checklistExecutionRevision.create({
                        data: {
                            executionId: taskId,
                            revision: clientRev,
                            responses: responses || {},
                            metadataSnapshot: metaIn,
                            completedAt: completedAtD,
                            submissionId: submissionId || null,
                            businessMetrics: businessSnap,
                        },
                    });
                    return tx.checklistExecution.update({
                        where: { id: taskId },
                        data: {
                            status: 'COMPLETED',
                            lastSubmittedRevision: clientRev,
                            responses: responses || {},
                            metadata: mergedExecutionMeta,
                            gpsLocation: gpsLocation || null,
                            startedAt: finalStartedAt,
                            completedAt: completedAtD,
                            syncedAt: new Date(),
                            businessMetrics: businessSnap,
                        },
                    });
                });

                if (shouldSpawnNextRoutine && execution?.id) {
                    try {
                        nextRoutineTaskPayload = await createNextRoutineTaskAfterComplete(prisma, {
                            completedExecutionId: execution.id,
                        });
                    } catch (rtErr) {
                        console.error('[routineTask] spawn após submissão', rtErr);
                    }
                }
            }
        }
        
        // Fallback: This is an ad-hoc local checklist execution not dispatched from the cloud. Create it.
        if (!execution) {
            if (!Number.isFinite(clientRev) || clientRev < 1) clientRev = 1;
            if (clientRev !== 1) {
                return res.status(422).json({ error: 'revision_mismatch', expectedNext: 1, lastSubmittedRevision: 0 });
            }
            if (submissionId) {
                const dup = await prisma.checklistExecutionRevision.findUnique({ where: { submissionId } });
                if (dup) {
                    const ex = await prisma.checklistExecution.findUnique({ where: { id: dup.executionId } });
                    if (ex) {
                        return res.json({ success: true, executionId: ex.id, idempotent: true });
                    }
                }
            }
            const resolvedOwner =
              ownerEmail && sameOwnerEmail(ownerEmail, authEmail) ? ownerEmail : authEmail;
            if (req.user.tenantId) {
                const ftQ = await consumeQuota(prisma, req.user.tenantId, 'FIELD_TASK', 1);
                if (!ftQ.ok) {
                    return res.status(403).json({
                        error: ftQ.error,
                        code: ftQ.code || 'PLAN_QUOTA_EXCEEDED',
                    });
                }
            }
            const osNumber = await allocateNextFtOsNumber(prisma);
            const businessSnapAdHoc = computeExecutionBusinessMetrics({
                responses: responses || {},
                metadata: metaIn,
                execution: {
                    etaMinutes: null,
                    locationLat: null,
                    locationLng: null,
                    startedAt: startedAt ? new Date(startedAt) : null,
                    completedAt: completedAtD,
                    expectedFormDurationMinutes: null,
                },
                revision: 1,
            });
            execution = await prisma.$transaction(async (tx) => {
                const ex = await tx.checklistExecution.create({
                    data: {
                        osNumber,
                        templateId: finalTemplateId,
                        ownerEmail: resolvedOwner || 'unknown@owner.com',
                        assetId: assetId || null,
                        status: 'COMPLETED',
                        lastSubmittedRevision: 1,
                        responses: responses || {},
                        metadata: metaIn,
                        gpsLocation: gpsLocation || null,
                        startedAt: startedAt ? new Date(startedAt) : null,
                        completedAt: completedAtD,
                        syncedAt: new Date(),
                        businessMetrics: businessSnapAdHoc,
                    },
                });
                await tx.checklistExecutionRevision.create({
                    data: {
                        executionId: ex.id,
                        revision: 1,
                        responses: responses || {},
                        metadataSnapshot: metaIn,
                        completedAt: completedAtD,
                        submissionId: submissionId || null,
                        businessMetrics: businessSnapAdHoc,
                    },
                });
                return ex;
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
        
        res.json({
            success: true,
            executionId: execution.id,
            ...(nextRoutineTaskPayload ? { nextRoutineTask: nextRoutineTaskPayload } : {}),
        });
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
        
        // Título da OS (painel) ≠ nome do formulário — guardar ambos em metadata.
        const osTitle =
            (payload.title != null && String(payload.title).trim()) || 'Nova OS Designada';
        let templateDesc = payload.description || 'Tarefa de rotina despachada.';
        let formTemplateTitle = null;
        let realTemplateId = null;
        let loadedTemplate = null;

        try {
            loadedTemplate = await prisma.checklistTemplate.findUnique({ where: { id: payload.refId } });
            if (loadedTemplate) {
                realTemplateId = loadedTemplate.id;
                formTemplateTitle = loadedTemplate.title || null;
                templateDesc = loadedTemplate.description || templateDesc;
            }
        } catch (e) {
            /* template not found is OK for ad-hoc */
        }

        // Cada dispatch cria uma OS independente — sem deduplicação automática.
        // Admin pode cancelar OS via Central de Operações se necessário.

        const assigneeEmail = String(payload.ownerEmail || '').trim();
        const scopedTenantId = loadedTemplate?.tenantId || null;
        const resolvedOwnerEmail = await resolveFieldTaskAssigneeEmail(
          prisma,
          assigneeEmail,
          scopedTenantId || undefined
        );
        if (!resolvedOwnerEmail) {
          const scoped = scopedTenantId ? ' nesta organização' : '';
          return res.status(400).json({
            error: `O e-mail não corresponde a um usuário ativo elegível (contas cliente não recebem OS)${scoped}. A OS não foi criada.`,
          });
        }

        const scheduledStart = parseScheduledStartAt(payload.scheduledStartAt);
        if (!scheduledStart) {
            return res.status(400).json({
                error: 'Informe scheduledStartAt (data e hora de início na agenda do técnico), em ISO 8601.',
            });
        }

        if (scopedTenantId) {
            const ftQ = await consumeQuota(prisma, scopedTenantId, 'FIELD_TASK', 1);
            if (!ftQ.ok) {
                return res.status(403).json({
                    error: ftQ.error,
                    code: ftQ.code || 'PLAN_QUOTA_EXCEEDED',
                });
            }
        }
        const tplSettings =
            loadedTemplate && loadedTemplate.settings && typeof loadedTemplate.settings === 'object'
                ? loadedTemplate.settings
                : {};
        const snapExpectedMin = resolveSnapshotExpectedFormDurationMinutes(
            tplSettings.expectedFormDurationMinutes,
            payload.expectedFormDurationMinutes,
        );

        const osNumber = await allocateNextFtOsNumber(prisma);
        const execution = await prisma.checklistExecution.create({
            data: {
                osNumber,
                templateId: realTemplateId,    // nullable FK — ok if null
                ownerEmail: resolvedOwnerEmail,
                status: 'PENDING',
                responses: null,               // deliberately empty until tech fills it
                scheduledStartAt: scheduledStart,
                expectedFormDurationMinutes: snapExpectedMin,
                // Geofencing Location
                locationLat:      payload.locationLat      ? parseFloat(payload.locationLat)  : null,
                locationLng:      payload.locationLng      ? parseFloat(payload.locationLng)  : null,
                locationRadius:   payload.locationRadius   ? parseInt(payload.locationRadius) : null,
                locationAddress:  payload.locationAddress  || null,
                locationZoneType: payload.locationZoneType || null,
                locationPolygon:  payload.locationPolygon  || null,
                metadata: {
                    ...(payload.metadata || {}),
                    refId: payload.refId, // keep original for mobile to load schema
                    title: osTitle,
                    ...(formTemplateTitle ? { templateTitle: formTemplateTitle } : {}),
                    description: templateDesc,
                },
            }
        });
        
        console.log(`[DISPATCH] 📍 locationZoneType=${execution.locationZoneType} | polygon.length=${Array.isArray(execution.locationPolygon) ? execution.locationPolygon.length : 'null'} | lat=${execution.locationLat}`);
        
        // ─── Push (categorias/botões no app; canais Android em fieldTaskAssigneePush) ───
        try {
            const emailRaw = String(resolvedOwnerEmail || '').trim();
            const pushTitle = String(osTitle).slice(0, 120);
            const pushBody = formTemplateTitle
                ? String(formTemplateTitle).slice(0, 180)
                : 'Nova atividade na sua lista.';
            await sendFieldTaskActivityPushToAssignee(prisma, {
                ownerEmail: emailRaw,
                templateTenantId: loadedTemplate?.tenantId ?? null,
                assigneeTenantId: null,
                executionId: execution.id,
                pushTitle,
                pushBody,
                logLabel: 'DISPATCH',
            });
        } catch (pushErr) {
            console.error('[DISPATCH] Falha ao enviar push:', pushErr.message);
        }
        
        res.json({ success: true, task: { id: execution.id, refId: payload.refId, osNumber: execution.osNumber } });
    } catch (err) {
        console.error("POST /api/checklists/dispatch error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
