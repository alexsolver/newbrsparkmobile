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
    ensureUniqueActiveTitleInFolder,
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
const {
    sameOwnerEmail,
    canAppUserAccessFieldTaskExecution,
    isFieldTaskBroadcastOpen,
    normalizeBroadcastCandidateEmails,
    normalizeEmail,
    broadcastCandidateArray,
} = require('../lib/fieldTaskExecutionAccess');
const { preserveDispatchClientContactMetadata } = require('../lib/technicianClientChatGate');
const { notifyBroadcastLosers } = require('../lib/fieldTaskBroadcastNotify');
const {
    TRANSIT_ETA_DISPLAY_SNAPSHOT_AT,
    TRANSIT_ETA_DISPLAY_REMAINING_MIN,
    stripTransitEtaDisplayFields,
} = require('../lib/transitEtaDisplaySnapshot');

const DUPLICATE_TEMPLATE_TITLE_PT =
    'Já existe um formulário ativo com este nome nesta pasta. Escolha outro título ou pasta.';

/** Mensagem legível quando a BD não tem tabelas esperadas pelo schema (migrações em falta). */
function friendlyChecklistTemplateSaveError(err) {
    if (!err) return 'Erro ao gravar o modelo.';
    const code = String(err.code || '');
    const msg = String(err.message || '');
    if (code === 'P2021' || /does not exist in the current database/i.test(msg)) {
        return (
            'A base de dados está desatualizada (falta uma ou mais tabelas do BrSpark). ' +
            'No servidor, na pasta admin-panel/backend, execute: npx prisma migrate deploy  e reinicie a API.'
        );
    }
    return msg || 'Erro ao gravar o modelo.';
}

function buildChecklistTemplateVersionSnapshot(row, extra) {
    if (!row || typeof row !== 'object') return null;
    const out = {
        templateId: String(row.id),
        version: Number(row.version || 1),
        title: String(row.title || '').trim(),
        description: row.description != null ? String(row.description) : null,
        settings: row.settings && typeof row.settings === 'object' ? row.settings : {},
        schemaData: Array.isArray(row.schemaData) ? row.schemaData : [],
        metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
        folderId: row.folderId == null ? null : String(row.folderId),
        isActive: row.isActive !== false,
        changeNote: extra && extra.changeNote ? String(extra.changeNote).slice(0, 240) : null,
        createdBy: extra && extra.createdBy ? String(extra.createdBy).slice(0, 240) : null,
    };
    return out;
}

async function createChecklistTemplateVersion(tx, row, extra) {
    const snapshot = buildChecklistTemplateVersionSnapshot(row, extra);
    if (!snapshot || !snapshot.title) return null;
    const delegate = tx && tx.checklistTemplateVersion;
    if (!delegate || typeof delegate.create !== 'function') {
        const err = new Error(
            'Cliente Prisma desatualizado (falta o modelo ChecklistTemplateVersion). ' +
                'Na pasta admin-panel/backend execute: npx prisma generate  e reinicie o backend. ' +
                'Se a base ainda não tiver a tabela, execute também: npx prisma migrate deploy',
        );
        err.code = 'PRISMA_CLIENT_STALE';
        throw err;
    }
    return delegate.create({ data: snapshot });
}

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

/**
 * Prazo de aceite da oferta (broadcast). Integrações: ISO 8601; epoch em segundos ou ms também aceites.
 * @returns {{ ok: true, date: Date } | { ok: false, error: string }}
 */
function parseBroadcastClaimExpiresAtInput(raw) {
    if (raw === undefined || raw === null) {
        return { ok: true, date: null };
    }
    const s = String(raw).trim();
    if (!s) {
        return { ok: true, date: null };
    }
    let ms;
    if (/^\d+$/.test(s)) {
        const n = Number(s);
        ms = n < 1e12 ? n * 1000 : n;
    } else {
        ms = Date.parse(s);
    }
    if (!Number.isFinite(ms)) {
        return {
            ok: false,
            error: 'broadcastClaimExpiresAt inválido: use ISO 8601 (ex.: 2026-04-20T15:00:00.000Z) ou instante Unix em segundos ou milissegundos.',
        };
    }
    const d = new Date(ms);
    const skewMs = 60_000;
    if (d.getTime() <= Date.now() - skewMs) {
        return {
            ok: false,
            error: 'broadcastClaimExpiresAt deve ser após o momento atual (tolerância 1 min).',
        };
    }
    return { ok: true, date: d };
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

// GET /api/checklists/templates — modelos ativos (despacho, app); use ?includeArchived=1 no builder para ver inativos.
router.get('/templates', async (req, res) => {
    try {
        const includeArchived =
            req.query && (req.query.includeArchived === '1' || req.query.includeArchived === 'true');
        const templates = await prisma.checklistTemplate.findMany({
            where: includeArchived ? {} : { isActive: true },
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

router.get('/templates/:id/history', adminAuthThenPanel, async (req, res) => {
    try {
        const { id } = req.params;
        const template = await prisma.checklistTemplate.findUnique({
            where: { id },
            select: { id: true, title: true, version: true, isActive: true, updatedAt: true },
        });
        if (!template) return res.status(404).json({ error: 'Template não encontrado.' });
        const versions = await prisma.checklistTemplateVersion.findMany({
            where: { templateId: id },
            orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
        });
        res.json({
            template,
            versions,
        });
    } catch (err) {
        console.error('GET /api/checklists/templates/:id/history error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/checklists/templates (Admin Panel salva um schema)
router.post('/templates', async (req, res) => {
    try {
        const { id, title, description, metadata } = req.body;
        let { settings, schemaData, folderId, changeNote } = req.body;
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
                const bodyIsActive =
                    req.body && typeof req.body.isActive === 'boolean' ? req.body.isActive : undefined;
                const endingActive =
                    bodyIsActive === undefined ? existing.isActive !== false : bodyIsActive;

                let resolvedTitle = normTitleUp;
                if (endingActive && existing.isActive === false) {
                    const safeTitle = await ensureUniqueActiveTitleInFolder(prisma, {
                        folderId: effectiveFolder,
                        desiredTitle: normTitleUp,
                        excludeId: id,
                    });
                    if (safeTitle && safeTitle !== normTitleUp) resolvedTitle = safeTitle;
                }

                if (endingActive) {
                    const dupUp = await findActiveDuplicateInFolder(prisma, {
                        folderId: effectiveFolder,
                        title: resolvedTitle,
                        excludeId: id,
                    });
                    if (dupUp) {
                        return res.status(409).json({ error: DUPLICATE_TEMPLATE_TITLE_PT });
                    }
                }

                const updateData = {
                    title: resolvedTitle,
                    description,
                    settings,
                    schemaData,
                    metadata,
                    version: Number(existing.version || 1) + 1,
                };
                if (folderIdNorm !== undefined) updateData.folderId = folderIdNorm;
                if (bodyIsActive !== undefined) {
                    updateData.isActive = bodyIsActive;
                }
                const updated = await prisma.$transaction(async (tx) => {
                    const saved = await tx.checklistTemplate.update({
                        where: { id },
                        data: updateData,
                    });
                    await createChecklistTemplateVersion(tx, saved, {
                        changeNote: changeNote || 'Nova versão salva no Form Builder',
                        createdBy: req.admin && req.admin.email ? req.admin.email : null,
                    });
                    return saved;
                });
                if (!updated.isActive) {
                    prisma.checklistTemplateEmbedding
                        .deleteMany({ where: { templateId: updated.id } })
                        .catch(() => {});
                } else {
                    scheduleChecklistTemplateEmbeddingSync(updated.id);
                }
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

        const createIsActive =
            req.body && typeof req.body.isActive === 'boolean' ? !!req.body.isActive : true;

        const created = await prisma.$transaction(async (tx) => {
            const row = await tx.checklistTemplate.create({
                data: {
                    id: id && typeof id === 'string' ? id : undefined,
                    title: normTitleCr,
                    description,
                    settings: settings || {},
                    schemaData,
                    metadata: metadata || {},
                    folderId: createFolderId,
                    isActive: createIsActive,
                    ...(tenantIdForTpl ? { tenantId: tenantIdForTpl } : {}),
                },
            });
            await createChecklistTemplateVersion(tx, row, {
                changeNote: changeNote || 'Versão inicial do formulário',
                createdBy: req.admin && req.admin.email ? req.admin.email : null,
            });
            return row;
        });
        if (!created.isActive) {
            prisma.checklistTemplateEmbedding
                .deleteMany({ where: { templateId: created.id } })
                .catch(() => {});
        } else {
            scheduleChecklistTemplateEmbeddingSync(created.id);
        }
        res.json(created);
    } catch (err) {
        console.error("POST /api/checklists/templates error:", err);
        res.status(500).json({ error: friendlyChecklistTemplateSaveError(err) });
    }
});

router.post('/templates/:id/restore/:versionId', adminAuthThenPanel, async (req, res) => {
    try {
        const { id, versionId } = req.params;
        const template = await prisma.checklistTemplate.findUnique({ where: { id } });
        if (!template) return res.status(404).json({ error: 'Template não encontrado.' });
        const snapshot = await prisma.checklistTemplateVersion.findFirst({
            where: { id: versionId, templateId: id },
        });
        if (!snapshot) return res.status(404).json({ error: 'Versão não encontrada.' });
        const desiredFolder = snapshot.folderId == null ? null : String(snapshot.folderId);
        const safeTitle = await ensureUniqueActiveTitleInFolder(prisma, {
            folderId: desiredFolder,
            desiredTitle: snapshot.title,
            excludeId: id,
        });
        const restored = await prisma.$transaction(async (tx) => {
            const saved = await tx.checklistTemplate.update({
                where: { id },
                data: {
                    title: safeTitle || snapshot.title,
                    description: snapshot.description,
                    settings: snapshot.settings,
                    schemaData: snapshot.schemaData,
                    metadata: snapshot.metadata,
                    folderId: desiredFolder,
                    isActive: true,
                    version: Number(template.version || 1) + 1,
                },
            });
            await createChecklistTemplateVersion(tx, saved, {
                changeNote:
                    'Restaurado a partir da versão #' +
                    String(snapshot.version) +
                    (safeTitle && safeTitle !== snapshot.title ? ' (título ajustado para evitar conflito)' : ''),
                createdBy: req.admin && req.admin.email ? req.admin.email : null,
            });
            return saved;
        });
        scheduleChecklistTemplateEmbeddingSync(restored.id);
        res.json(restored);
    } catch (err) {
        console.error('POST /api/checklists/templates/:id/restore/:versionId error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/templates/:id/unarchive', adminAuthThenPanel, async (req, res) => {
    try {
        const { id } = req.params;
        const tpl = await prisma.checklistTemplate.findUnique({ where: { id } });
        if (!tpl) return res.status(404).json({ error: 'Template não encontrado.' });
        const safeTitle = await ensureUniqueActiveTitleInFolder(prisma, {
            folderId: tpl.folderId == null ? null : String(tpl.folderId),
            desiredTitle: tpl.title,
            excludeId: id,
        });
        const restored = await prisma.$transaction(async (tx) => {
            const saved = await tx.checklistTemplate.update({
                where: { id },
                data: {
                    isActive: true,
                    title: safeTitle || tpl.title,
                    version: Number(tpl.version || 1) + 1,
                },
            });
            await createChecklistTemplateVersion(tx, saved, {
                changeNote:
                    'Formulário restaurado do arquivo' +
                    (safeTitle && safeTitle !== tpl.title ? ' (título ajustado para evitar conflito)' : ''),
                createdBy: req.admin && req.admin.email ? req.admin.email : null,
            });
            return saved;
        });
        scheduleChecklistTemplateEmbeddingSync(restored.id);
        res.json(restored);
    } catch (err) {
        console.error('POST /api/checklists/templates/:id/unarchive error:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/checklists/templates/:id (Admin Panel deleta logicamente um schema)
router.delete('/templates/:id', adminAuthThenPanel, async (req, res) => {
    try {
        const { id } = req.params;
        const current = await prisma.checklistTemplate.findUnique({
            where: { id },
        });
        if (!current) return res.status(404).json({ error: 'Template não encontrado.' });
        const deleted = await prisma.$transaction(async (tx) => {
            const saved = await tx.checklistTemplate.update({
                where: { id },
                data: { isActive: false }
            });
            await createChecklistTemplateVersion(tx, saved, {
                changeNote: 'Formulário arquivado',
                createdBy: req.admin && req.admin.email ? req.admin.email : null,
            });
            return saved;
        });
        prisma.checklistTemplateEmbedding.deleteMany({ where: { templateId: id } }).catch(() => {});
        res.json({ success: true, id: deleted.id, archived: true });
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
        if (!canAppUserAccessFieldTaskExecution(exec, req.user.email)) {
            return res.status(403).json({ error: 'Acesso negado a esta execução.' });
        }
        res.json(exec);
    } catch (err) {
        console.error("GET /api/checklists/executions/:taskId error:", err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/checklists/executions/:taskId/transit-eta-display
// Snapshot do ETA igual ao do mapa (Google/OSRM + contagem no relógio) para o link de acompanhamento.
router.patch('/executions/:taskId/transit-eta-display', authUser, async (req, res) => {
    try {
        const { taskId } = req.params;
        const exec = await prisma.checklistExecution.findUnique({
            where: { id: taskId },
            select: { id: true, ownerEmail: true, metadata: true },
        });
        if (!exec) return res.status(404).json({ error: 'OS não encontrada' });
        if (!canAppUserAccessFieldTaskExecution(exec, req.user.email)) {
            return res.status(403).json({ error: 'Acesso negado a esta OS.' });
        }

        let meta =
            typeof exec.metadata === 'object' && exec.metadata && !Array.isArray(exec.metadata)
                ? { ...exec.metadata }
                : {};

        const clear = req.body && (req.body.clear === true || req.body.clear === 'true');
        if (clear) {
            stripTransitEtaDisplayFields(meta);
        } else {
            const snapshotAtRaw = req.body && req.body.snapshotAt;
            const remRaw = req.body && req.body.remainingMinutes;
            const ts = typeof snapshotAtRaw === 'string' ? Date.parse(snapshotAtRaw) : NaN;
            const remainingMinutes = Number(remRaw);
            if (!Number.isFinite(ts) || !Number.isFinite(remainingMinutes)) {
                return res.status(400).json({ error: 'Use snapshotAt (ISO) e remainingMinutes (número).' });
            }
            if (remainingMinutes < 1 || remainingMinutes > 36 * 60) {
                return res.status(400).json({ error: 'remainingMinutes inválido.' });
            }
            const skewMs = Math.abs(Date.now() - ts);
            if (skewMs > 300000) {
                return res.status(400).json({ error: 'snapshotAt fora da janela de relógio permitida.' });
            }
            meta[TRANSIT_ETA_DISPLAY_SNAPSHOT_AT] = new Date(ts).toISOString();
            meta[TRANSIT_ETA_DISPLAY_REMAINING_MIN] = Math.round(remainingMinutes);
        }

        await prisma.checklistExecution.update({
            where: { id: taskId },
            data: { metadata: meta },
        });
        res.json({ ok: true });
    } catch (err) {
        console.error('PATCH /executions/:taskId/transit-eta-display error:', err);
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
        const metadataSnapshotBeforePatch = existing.metadata;
        if (!canAppUserAccessFieldTaskExecution(existing, req.user.email)) {
            return res.status(403).json({ error: 'Acesso negado a esta OS.' });
        }
        if (isFieldTaskBroadcastOpen(existing)) {
            const allowed = !statusNorm || ['RECEIVED', 'PENDING'].includes(statusNorm);
            if (!allowed) {
                return res.status(409).json({
                    error:
                        'Aceite a OS online (primeiro a aceitar fica com ela) antes de alterar para este estado.',
                    code: 'BROADCAST_CLAIM_REQUIRED',
                });
            }
            if (
                responses &&
                typeof responses === 'object' &&
                !Array.isArray(responses) &&
                Object.keys(responses).length > 0
            ) {
                return res.status(409).json({
                    error: 'Aceite a OS online antes de enviar respostas ou pausas.',
                    code: 'BROADCAST_CLAIM_REQUIRED',
                });
            }
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
                stripRevisionSessionEvidenceInPlace(copy, existing.template);
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

        mergedMeta = preserveDispatchClientContactMetadata(metadataSnapshotBeforePatch, mergedMeta);
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
            const completedAtEff = updateData.completedAt ?? existing.completedAt;
            const snapshotAtMsPatch = completedAtEff
                ? new Date(completedAtEff).getTime()
                : Date.now();
            updateData.businessMetrics = computeExecutionBusinessMetrics({
                responses: finalResp,
                metadata: mergedMeta,
                execution: {
                    etaMinutes: existing.etaMinutes,
                    locationLat: existing.locationLat,
                    locationLng: existing.locationLng,
                    startedAt: updateData.startedAt ?? existing.startedAt,
                    completedAt: completedAtEff,
                    expectedFormDurationMinutes: existing.expectedFormDurationMinutes,
                },
                revision: existing.lastSubmittedRevision,
                snapshotAtMs: snapshotAtMsPatch,
                template: existing.template || null,
            });
        }

        const prevStatus = String(existing.status || '').toUpperCase();
        const execution = await prisma.checklistExecution.update({
            where: { id: taskId },
            data: updateData
        });

        const nextStatus = String(execution.status || '').toUpperCase();
        const enteredEvaluationTriggerStatus =
            (statusNorm === 'SYNCED' || statusNorm === 'COMPLETED') &&
            !['SYNCED', 'COMPLETED'].includes(prevStatus) &&
            (nextStatus === 'SYNCED' || nextStatus === 'COMPLETED');
        if (enteredEvaluationTriggerStatus) {
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

// POST /api/checklists/executions/:taskId/claim — leilão: primeiro JWT a confirmar ganha a OS (só com rede no cliente)
router.post('/executions/:taskId/claim', authUser, async (req, res) => {
    try {
        const { taskId } = req.params;
        const uid = String(req.user?.id || '').trim();
        const email = normalizeEmail(req.user?.email || '');
        if (!taskId || !uid || !email) {
            return res.status(400).json({ error: 'Sessão inválida.' });
        }

        const out = await prisma.$transaction(async (tx) => {
            const ex = await tx.checklistExecution.findUnique({
                where: { id: taskId },
                include: { template: true },
            });
            if (!ex) return { err: 404, body: { error: 'OS não encontrada.' } };
            if (
                String(ex.assignmentMode || '').toUpperCase() !== 'BROADCAST' ||
                String(ex.claimStatus || '').toUpperCase() !== 'OPEN'
            ) {
                return { err: 409, body: { error: 'Esta OS não está aberta a concorrência.', code: 'NOT_BROADCAST_OPEN' } };
            }
            const candidates = broadcastCandidateArray(ex.broadcastCandidates);
            if (!candidates.includes(email)) {
                return { err: 403, body: { error: 'O seu utilizador não está convidado a esta OS.' } };
            }
            const st = String(ex.status || '').toUpperCase();
            if (['COMPLETED', 'SYNCED', 'CANCELLED', 'CANCELED', 'REJECTED'].includes(st)) {
                return { err: 409, body: { error: 'OS já encerrada.' } };
            }
            let meta = ex.metadata && typeof ex.metadata === 'object' && !Array.isArray(ex.metadata) ? { ...ex.metadata } : {};
            const acceptedTs = new Date().toISOString();
            meta.acceptedAt = acceptedTs;

            const upd = await tx.checklistExecution.updateMany({
                where: {
                    id: taskId,
                    assignmentMode: 'BROADCAST',
                    claimStatus: 'OPEN',
                },
                data: {
                    ownerEmail: email,
                    claimStatus: 'CLAIMED',
                    claimedByUserId: uid,
                    claimedAt: new Date(),
                    status: 'ACCEPTED',
                    metadata: meta,
                },
            });
            if (upd.count !== 1) {
                return {
                    err: 409,
                    body: {
                      error: 'Essa OS não está mais disponível.',
                      code: 'CLAIM_LOST',
                    },
                };
            }
            const after = await tx.checklistExecution.findUnique({ where: { id: taskId }, include: { template: true } });
            return { ok: true, execution: after, candidates };
        });

        if (out.err) {
            return res.status(out.err).json(out.body);
        }

        const ex = out.execution;
        const cand = out.candidates || [];
        const losers = cand.filter((c) => normalizeEmail(c) !== normalizeEmail(email));
        const metaTitle =
            (ex.metadata && typeof ex.metadata === 'object' && ex.metadata.title) || 'OS';
        await notifyBroadcastLosers(prisma, {
            winnerEmail: email,
            loserEmails: losers,
            executionId: ex.id,
            templateTenantId: ex.template?.tenantId ?? null,
            osLabel: String(metaTitle).slice(0, 80),
        }).catch((e) => console.warn('[claim] notify losers', e));

        return res.json({
            ok: true,
            taskId: ex.id,
            status: ex.status,
            ownerEmail: ex.ownerEmail,
            claimStatus: ex.claimStatus,
            assignmentMode: ex.assignmentMode,
        });
    } catch (err) {
        console.error('[POST /executions/:taskId/claim]', err);
        return res.status(500).json({ error: err.message });
    }
});

/** Recusa broadcast: rotas montadas em `index.js` antes de `app.use('/api/checklists', …)`. */

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
        let existingTask = null;

        if (taskId) {
            existingTask = await prisma.checklistExecution.findUnique({
                where: { id: taskId },
                include: { template: true },
            });
            if (existingTask && !canAppUserAccessFieldTaskExecution(existingTask, authEmail)) {
                return res.status(403).json({ error: 'Acesso negado a esta OS.' });
            }
            if (
                existingTask &&
                isFieldTaskBroadcastOpen(existingTask) &&
                responses &&
                typeof responses === 'object' &&
                !Array.isArray(responses) &&
                Object.keys(responses).length > 0
            ) {
                return res.status(409).json({
                    error: 'Aceite a OS online antes de sincronizar o preenchimento.',
                    code: 'BROADCAST_CLAIM_REQUIRED',
                });
            }
            if (submissionId && existingTask) {
                const dup = await prisma.checklistExecutionRevision.findUnique({
                    where: { submissionId },
                });
                if (dup) {
                    return res.json({ success: true, executionId: existingTask.id, idempotent: true });
                }
            }
            if (!finalTemplateId && existingTask?.templateId) {
                finalTemplateId = existingTask.templateId;
            }
        }

        /* Biometria facial pendente + visão IA pendente com URL já pública: completar no servidor antes de gravar a revisão. */
        if (responses && typeof responses === 'object' && !Array.isArray(responses) && req.user.tenantId && req.user.id) {
            const { cloneResponsesShallow, resolvePendingFacialAuditsOnSync } = require('../lib/facialRecognitionEngine');
            const { resolvePendingVisionAnalysisOnSync } = require('../lib/resolvePendingVisionOnSync');
            const { resolvePendingVoiceNotesOnSync } = require('../lib/resolvePendingVoiceNoteOnSync');
            let templateIdForMediaResolve = finalTemplateId;
            if (templateIdForMediaResolve) {
                responses = cloneResponsesShallow(responses);
                try {
                    const n = await resolvePendingFacialAuditsOnSync(prisma, {
                        responses,
                        templateId: templateIdForMediaResolve,
                        tenantId: req.user.tenantId,
                        sessionUserId: req.user.id,
                    });
                    if (n > 0) {
                        console.log(`[checklists] Biometria pendente processada no sync: ${n} campo(s)`);
                    }
                } catch (fe) {
                    console.error('[checklists] resolvePendingFacialAuditsOnSync', fe);
                }
                try {
                    const nVis = await resolvePendingVisionAnalysisOnSync(prisma, {
                        responses,
                        templateId: templateIdForMediaResolve,
                        tenantId: req.user.tenantId,
                    });
                    if (nVis > 0) {
                        console.log(`[checklists] Visão IA pendente completada no sync: ${nVis} campo(s)`);
                    }
                } catch (ve) {
                    console.error('[checklists] resolvePendingVisionAnalysisOnSync', ve);
                }
                try {
                    const nVoice = await resolvePendingVoiceNotesOnSync(prisma, {
                        responses,
                        templateId: templateIdForMediaResolve,
                    });
                    if (nVoice > 0) {
                        console.log(`[checklists] Nota de voz pendente transcrita no sync: ${nVoice} campo(s)`);
                    }
                } catch (vne) {
                    console.error('[checklists] resolvePendingVoiceNotesOnSync', vne);
                }
            }
        }

        // If the task was dispatched from the cloud, the mobile app sends taskId. 
        // We update the existing PENDING execution instead of creating a new one!
        if (taskId) {
            const existing = existingTask;
            if (existing) {
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
                    return preserveDispatchClientContactMetadata(existing.metadata, nm);
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
                    snapshotAtMs: completedAtD.getTime(),
                    template: existing.template || null,
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
            let templateForMetrics = null;
            if (finalTemplateId) {
                templateForMetrics = await prisma.checklistTemplate.findUnique({
                    where: { id: finalTemplateId },
                });
            }
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
                snapshotAtMs: completedAtD.getTime(),
                template: templateForMetrics,
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

        try {
            const st = String(execution.status || '').toUpperCase();
            if (st === 'COMPLETED' || st === 'SYNCED') {
                const { onChecklistExecutionSynced } = require('../lib/evaluationTrigger');
                onChecklistExecutionSynced(execution.id).catch((e) =>
                    console.error('[evaluationTrigger] onChecklistExecutionSynced', e)
                );
            }
        } catch (e) {
            console.error('[evaluationTrigger] pós-submissão', e);
        }
        
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
        if (!payload || !payload.refId) {
            return res.status(400).json({ error: 'refId é obrigatório.' });
        }
        const multi = Array.isArray(payload.candidateEmails) && payload.candidateEmails.length > 0;
        if (!payload.ownerEmail && !multi) {
            return res.status(400).json({ error: 'ownerEmail ou candidateEmails é obrigatório.' });
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

        const scopedTenantId = loadedTemplate?.tenantId || null;
        let resolvedList = [];
        if (multi) {
            for (const raw of payload.candidateEmails) {
                const r = await resolveFieldTaskAssigneeEmail(
                    prisma,
                    String(raw || '').trim(),
                    scopedTenantId || undefined
                );
                if (r) resolvedList.push(r);
            }
        } else {
            const r = await resolveFieldTaskAssigneeEmail(
                prisma,
                String(payload.ownerEmail || '').trim(),
                scopedTenantId || undefined
            );
            if (r) resolvedList.push(r);
        }
        {
            const seenCanon = new Set();
            resolvedList = resolvedList.filter((em) => {
                const k = String(em || '').trim().toLowerCase();
                if (!k || seenCanon.has(k)) return false;
                seenCanon.add(k);
                return true;
            });
        }
        if (resolvedList.length === 0) {
            const scoped = scopedTenantId ? ' nesta organização' : '';
            return res.status(400).json({
                error: `Nenhum e-mail válido para prestador elegível (ativo)${scoped}. A OS não foi criada.`,
            });
        }

        const isBroadcast = resolvedList.length >= 2;

        let broadcastClaimExpiresAt = null;
        if (isBroadcast && payload.broadcastClaimExpiresAt != null && String(payload.broadcastClaimExpiresAt).trim() !== '') {
            const parsed = parseBroadcastClaimExpiresAtInput(payload.broadcastClaimExpiresAt);
            if (!parsed.ok) {
                return res.status(400).json({ error: parsed.error });
            }
            broadcastClaimExpiresAt = parsed.date;
        } else if (!isBroadcast && payload.broadcastClaimExpiresAt != null && String(payload.broadcastClaimExpiresAt).trim() !== '') {
            return res.status(400).json({
                error: 'broadcastClaimExpiresAt só se aplica ao modo «primeiro a aceitar» (dois ou mais técnicos). Omita o campo ou use candidateEmails com 2+ e-mails.',
            });
        }

        if (multi && resolvedList.length < 2) {
            return res.status(400).json({
                error: 'Indique pelo menos dois técnicos distintos e elegíveis para o modo «primeiro a aceitar» (verifique duplicados ou e-mails fora da organização).',
            });
        }

        const urgenteRequested =
            payload.urgente === true ||
            payload.urgente === 1 ||
            String(payload.urgente ?? '')
                .trim()
                .toLowerCase() === 'true';

        if (urgenteRequested && !isBroadcast) {
            return res.status(400).json({
                error:
                    'Urgente só se aplica ao despacho em oferta (dois ou mais técnicos — primeiro a aceitar). Omita urgente ou adicione candidatos.',
            });
        }

        const urgenteFlag = isBroadcast && urgenteRequested;

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

        let dispatchFormIcon = null;
        let dispatchFormIconLibrary = null;
        if (loadedTemplate?.metadata != null) {
            const tm =
                typeof loadedTemplate.metadata === 'object' && !Array.isArray(loadedTemplate.metadata)
                    ? loadedTemplate.metadata
                    : {};
            const ic = tm.icon != null ? String(tm.icon).trim() : '';
            if (ic) {
                dispatchFormIcon = ic;
                dispatchFormIconLibrary =
                    tm.iconLibrary != null && String(tm.iconLibrary).trim()
                        ? String(tm.iconLibrary).trim()
                        : 'Ionicons';
            }
        }

        const rawLocationLat =
          payload.locationLat !== undefined && payload.locationLat !== null && String(payload.locationLat).trim() !== ''
            ? Number(payload.locationLat)
            : null;
        const rawLocationLng =
          payload.locationLng !== undefined && payload.locationLng !== null && String(payload.locationLng).trim() !== ''
            ? Number(payload.locationLng)
            : null;
        const rawLocationRadius =
          payload.locationRadius !== undefined && payload.locationRadius !== null && String(payload.locationRadius).trim() !== ''
            ? Number.parseInt(String(payload.locationRadius), 10)
            : null;
        const parsedLocationLat = rawLocationLat !== null && Number.isFinite(rawLocationLat) ? rawLocationLat : null;
        const parsedLocationLng = rawLocationLng !== null && Number.isFinite(rawLocationLng) ? rawLocationLng : null;
        const parsedLocationRadius = rawLocationRadius !== null && Number.isFinite(rawLocationRadius) ? rawLocationRadius : null;

        const osNumber = await allocateNextFtOsNumber(prisma);
        const broadcastList = normalizeBroadcastCandidateEmails(resolvedList);
        const execution = await prisma.checklistExecution.create({
            data: {
                osNumber,
                templateId: realTemplateId, // nullable FK — ok if null
                ownerEmail: isBroadcast ? null : resolvedList[0],
                assignmentMode: isBroadcast ? 'BROADCAST' : 'DIRECT',
                claimStatus: isBroadcast ? 'OPEN' : null,
                broadcastCandidates: isBroadcast ? broadcastList : undefined,
                broadcastClaimExpiresAt: broadcastClaimExpiresAt,
                status: 'PENDING',
                responses: null, // deliberately empty until tech fills it
                scheduledStartAt: scheduledStart,
                expectedFormDurationMinutes: snapExpectedMin,
                urgente: urgenteFlag,
                // Geofencing Location
                locationLat: parsedLocationLat,
                locationLng: parsedLocationLng,
                locationRadius: parsedLocationRadius,
                locationAddress: payload.locationAddress || null,
                locationZoneType: payload.locationZoneType || null,
                locationPolygon: payload.locationPolygon || null,
                metadata: {
                    ...(payload.metadata || {}),
                    refId: payload.refId, // keep original for mobile to load schema
                    title: osTitle,
                    ...(formTemplateTitle ? { templateTitle: formTemplateTitle } : {}),
                    description: templateDesc,
                    ...(isBroadcast ? { dispatchBroadcast: true, broadcastCandidateCount: broadcastList.length } : {}),
                    ...(dispatchFormIcon
                        ? {
                              icon: dispatchFormIcon,
                              iconLibrary: dispatchFormIconLibrary || 'Ionicons',
                          }
                        : {}),
                },
            }
        });
        
        console.log(`[DISPATCH] 📍 locationZoneType=${execution.locationZoneType} | polygon.length=${Array.isArray(execution.locationPolygon) ? execution.locationPolygon.length : 'null'} | lat=${execution.locationLat}`);
        
        // ─── Push (categorias/botões no app; canais Android em fieldTaskAssigneePush) ───
        // Título/corpo legíveis no Lock Screen: antes o `body` era só o nome do modelo (ex.: «face»),
        // o que parecia «push simples»; incluímos FT-… + modelo + título customizado do painel.
        try {
            const osNum = execution.osNumber ? String(execution.osNumber).trim() : '';
            const tplTitle = formTemplateTitle ? String(formTemplateTitle).trim() : '';
            const customOs = String(osTitle || '').trim();
            const genericLabel = (s) => {
                const t = String(s || '').trim().toLowerCase();
                return !t || t === 'nova os designada' || t === 'nova atividade';
            };

            let pushTitle = isBroadcast ? 'Nova OS — primeiro a aceitar' : 'Nova OS atribuída';
            if (urgenteFlag) {
                pushTitle = isBroadcast ? 'OS urgente — primeiro a aceitar' : 'OS urgente atribuída';
            }
            const parts = [];
            if (osNum) parts.push(osNum);
            if (tplTitle) parts.push(tplTitle);
            if (!genericLabel(customOs)) parts.push(customOs);
            let pushBody =
                parts.length > 0
                    ? parts.join(' · ')
                    : 'Abra o app para ver detalhes e aceitar.';
            if (isBroadcast) {
                pushBody = `${pushBody.slice(0, 120)} · Toque para aceitar (concorrência).`.slice(0, 180);
            }
            if (urgenteFlag) {
                pushBody = `URGENTE · ${pushBody}`.slice(0, 180);
            }
            if (pushBody.length > 180) pushBody = `${pushBody.slice(0, 177)}…`;

            for (const emailRaw of resolvedList) {
                await sendFieldTaskActivityPushToAssignee(prisma, {
                    ownerEmail: String(emailRaw || '').trim(),
                    templateTenantId: loadedTemplate?.tenantId ?? null,
                    assigneeTenantId: null,
                    executionId: execution.id,
                    pushTitle,
                    pushBody,
                    logLabel: 'DISPATCH',
                    extraData: isBroadcast ? { broadcastOffer: '1' } : {},
                });
            }
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
