'use strict';

const prisma = require('../db');
const { applySchemaPatch } = require('./formAiSchemaPatch');
const { sanitizeTemplateText } = require('./formAiNormalize');
const {
  applyTemplateSettingsPatch,
} = require('./formAiSettingsPatch');
const {
  applyTemplateMetadataPatch,
} = require('./formAiTemplateMetadataPatch');
const { mapLogicSuggestions } = require('./formAiCopilotLogicMap');
const { ensureUniqueActiveTitleInFolder, normalizeTemplateTitle } = require('./templateTitleUnique');

/**
 * @param {unknown} raw
 * @returns {{ id: string, question: string, choices: { id: string, label: string }[] }[]}
 */
function sanitizeClarifyOptions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const q of raw.slice(0, 6)) {
    if (!q || typeof q !== 'object') continue;
    const id = String(q.id || `pergunta_${out.length + 1}`).replace(/[^\w-]/g, '_').slice(0, 48);
    const question = String(q.question || q.prompt || '')
      .trim()
      .slice(0, 500);
    const choices = [];
    const rawChoices = Array.isArray(q.choices) ? q.choices : [];
    for (const c of rawChoices.slice(0, 14)) {
      if (!c || typeof c !== 'object') continue;
      const cid = String(c.id || `opt_${choices.length + 1}`).replace(/[^\w-]/g, '_').slice(0, 48);
      const label = String(c.label || '').trim().slice(0, 220);
      if (!label) continue;
      choices.push({ id: cid, label });
    }
    if (question && choices.length >= 2) out.push({ id, question, choices });
  }
  return out;
}

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function hasObjectKeys(v) {
  return !!(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length);
}

/**
 * Se houver patch aplicável (schema/settings/metadata/title), não devemos entrar
 * em modo "só perguntas". Isso reduz confirmações desnecessárias.
 * @param {Record<string, unknown>} parsed
 * @returns {boolean}
 */
function hasAnyApplicablePatchInParsed(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  const schemaPatch = parsed.schemaPatch && typeof parsed.schemaPatch === 'object' ? parsed.schemaPatch : null;
  const hasSchemaOps = !!(schemaPatch && Array.isArray(schemaPatch.operations) && schemaPatch.operations.length);
  const hasSettings = hasObjectKeys(parsed.settingsPatch);
  const hasMeta = hasObjectKeys(parsed.templateMetadataPatch);
  const hasTitle = typeof parsed.templateTitlePatch === 'string' && String(parsed.templateTitlePatch).trim().length > 0;
  return hasSchemaOps || hasSettings || hasMeta || hasTitle;
}

const COPILOT_MODES = new Set(['auto', 'create', 'refine', 'troubleshoot', 'rules', 'import_assist', 'explain']);

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeCopilotMode(raw) {
  const s = raw != null ? String(raw).trim().toLowerCase() : '';
  if (COPILOT_MODES.has(s)) return s;
  return 'auto';
}

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
function normalizeUxLayer(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const headline =
    typeof raw.headline === 'string' && raw.headline.trim() ? String(raw.headline).trim().slice(0, 400) : '';
  const bullets = Array.isArray(raw.bullets)
    ? raw.bullets
        .map((b) => (b != null ? String(b).trim().slice(0, 400) : ''))
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const troubleshoot = raw.troubleshoot && typeof raw.troubleshoot === 'object' ? raw.troubleshoot : null;
  let hypotheses = [];
  if (troubleshoot && Array.isArray(troubleshoot.hypotheses)) {
    hypotheses = troubleshoot.hypotheses
      .slice(0, 5)
      .map((h, i) => {
        if (!h || typeof h !== 'object') return null;
        return {
          rank: typeof h.rank === 'number' ? h.rank : i + 1,
          title: h.title != null ? String(h.title).trim().slice(0, 200) : '',
          detail: h.detail != null ? String(h.detail).trim().slice(0, 600) : '',
          recommendedFix: h.recommendedFix != null ? String(h.recommendedFix).trim().slice(0, 400) : '',
        };
      })
      .filter((x) => x && x.title);
  }
  const symptomClass =
    troubleshoot && troubleshoot.symptomClass != null
      ? String(troubleshoot.symptomClass).trim().slice(0, 80)
      : '';
  if (!headline && !bullets.length && !hypotheses.length) return null;
  return {
    headline: headline || null,
    bullets: bullets.length ? bullets : [],
    troubleshoot:
      hypotheses.length || symptomClass
        ? { symptomClass: symptomClass || null, hypotheses }
        : null,
  };
}

/**
 * Aplica o JSON devolvido pelo modelo às estruturas do painel (schema, settings, metadados, título, lógica).
 * @param {Record<string, unknown>} parsed
 * @param {{
 *   schemaData: object[],
 *   templateSettingsIn: Record<string, unknown>,
 *   templateMetadataIn: Record<string, unknown>,
 *   templateDraftTitle?: string,
 *   templateFolderId?: string | null,
 *   templateId?: string | null,
 *   templateSiblingTitles?: string[],
 *   documentationFetchWarning?: string,
 * }} ctx
 */
async function applyCopilotParsedPayload(parsed, ctx) {
  const schemaData = Array.isArray(ctx.schemaData) ? ctx.schemaData : [];
  const templateSettingsIn =
    ctx.templateSettingsIn && typeof ctx.templateSettingsIn === 'object' && !Array.isArray(ctx.templateSettingsIn)
      ? /** @type {Record<string, unknown>} */ ({ ...ctx.templateSettingsIn })
      : {};
  const templateMetadataIn =
    ctx.templateMetadataIn && typeof ctx.templateMetadataIn === 'object' && !Array.isArray(ctx.templateMetadataIn)
      ? /** @type {Record<string, unknown>} */ ({ ...ctx.templateMetadataIn })
      : {};

  const replyText =
    typeof parsed.replyText === 'string' && parsed.replyText.trim()
      ? parsed.replyText.trim()
      : 'Sem texto de resposta.';

  const warnings = [];
  if (typeof ctx.documentationFetchWarning === 'string' && ctx.documentationFetchWarning.trim()) {
    warnings.push(ctx.documentationFetchWarning.trim());
  }

  const clarifyOptions = sanitizeClarifyOptions(parsed.clarifyOptions);
  const parsedHasPatch = hasAnyApplicablePatchInParsed(parsed);
  let schemaPatch =
    parsed.schemaPatch && typeof parsed.schemaPatch === 'object' ? parsed.schemaPatch : null;
  let schemaDataAfter = schemaData;

  // Só entra no modo "clarify" se realmente não houver patch aplicável.
  if (clarifyOptions.length > 0 && !parsedHasPatch) {
    const { suggestions: logicSuggestions, warnings: lw } = mapLogicSuggestions(null, schemaDataAfter);
    warnings.push(...lw);
    return {
      replyText,
      clarifyOptions,
      schemaPatch: null,
      schemaData: schemaDataAfter,
      templateSettings: templateSettingsIn,
      settingsPatch: null,
      templateMetadata: templateMetadataIn,
      templateMetadataPatch: null,
      templateTitlePatch: null,
      templateTitleResolved: null,
      logicSuggestions,
      warnings,
      copilotMode: normalizeCopilotMode(parsed.copilotMode),
      uxLayer: normalizeUxLayer(parsed.uxLayer),
    };
  }

  let templateTitleResolved = null;
  let templateTitlePatchOut = null;
  const rawTitlePatch = parsed.templateTitlePatch;
  if (typeof rawTitlePatch === 'string' && normalizeTemplateTitle(rawTitlePatch)) {
    const sanitized = sanitizeTemplateText(String(rawTitlePatch).trim(), 200);
    const fid =
      ctx.templateFolderId === undefined ||
      ctx.templateFolderId === null ||
      ctx.templateFolderId === ''
        ? null
        : String(ctx.templateFolderId);
    const excl =
      ctx.templateId != null && String(ctx.templateId).trim() ? String(ctx.templateId).trim() : null;
    try {
      const unique = await ensureUniqueActiveTitleInFolder(prisma, {
        folderId: fid,
        desiredTitle: sanitized,
        excludeId: excl,
      });
      if (unique) {
        templateTitleResolved = unique;
        templateTitlePatchOut = unique;
      }
    } catch (e) {
      warnings.push(
        'Aviso: não foi possível validar unicidade do título na base — aplicado só o texto sugerido pela IA.'
      );
      templateTitleResolved = sanitized;
      templateTitlePatchOut = sanitized;
    }
  }

  let settingsPatch =
    parsed.settingsPatch && typeof parsed.settingsPatch === 'object' && !Array.isArray(parsed.settingsPatch)
      ? parsed.settingsPatch
      : null;
  let templateSettingsAfter = { ...templateSettingsIn };
  if (settingsPatch && Object.keys(settingsPatch).length) {
    const { settings: next, warnings: sw } = applyTemplateSettingsPatch(templateSettingsIn, settingsPatch);
    templateSettingsAfter = next;
    warnings.push(...sw);
    try {
      if (JSON.stringify(next) === JSON.stringify(templateSettingsIn)) {
        settingsPatch = null;
      }
    } catch {
      /* ignore */
    }
  } else {
    settingsPatch = null;
  }

  let templateMetadataPatch =
    parsed.templateMetadataPatch &&
    typeof parsed.templateMetadataPatch === 'object' &&
    !Array.isArray(parsed.templateMetadataPatch)
      ? parsed.templateMetadataPatch
      : null;
  let templateMetadataAfter = { ...templateMetadataIn };
  if (templateMetadataPatch && Object.keys(templateMetadataPatch).length) {
    const { metadata: nextMeta, warnings: wm } = applyTemplateMetadataPatch(
      templateMetadataIn,
      templateMetadataPatch
    );
    templateMetadataAfter = nextMeta;
    warnings.push(...wm);
    try {
      if (JSON.stringify(nextMeta) === JSON.stringify(templateMetadataIn)) {
        templateMetadataPatch = null;
      }
    } catch {
      /* ignore */
    }
  } else {
    templateMetadataPatch = null;
  }

  if (schemaPatch && Array.isArray(schemaPatch.operations) && schemaPatch.operations.length) {
    const { schemaData: next, warnings: w } = applySchemaPatch(schemaData, schemaPatch);
    schemaDataAfter = next;
    warnings.push(...w);
  } else {
    schemaPatch = null;
  }

  const { suggestions: logicSuggestions, warnings: lw } = mapLogicSuggestions(
    parsed.logicSuggestions,
    schemaDataAfter
  );
  warnings.push(...lw);

  return {
    replyText,
    clarifyOptions: [],
    schemaPatch,
    schemaData: schemaDataAfter,
    templateSettings: templateSettingsAfter,
    settingsPatch,
    templateMetadata: templateMetadataAfter,
    templateMetadataPatch,
    templateTitlePatch: templateTitlePatchOut,
    templateTitleResolved,
    logicSuggestions,
    warnings,
    copilotMode: normalizeCopilotMode(parsed.copilotMode),
    uxLayer: normalizeUxLayer(parsed.uxLayer),
  };
}

module.exports = {
  applyCopilotParsedPayload,
  sanitizeClarifyOptions,
  normalizeCopilotMode,
  normalizeUxLayer,
};
