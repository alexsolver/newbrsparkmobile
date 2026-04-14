'use strict';

const crypto = require('crypto');
const prisma = require('../db');
const { resolveEffectivePolicy, COPY } = require('./trackingChatModerationPolicy');
const { runTrackingChatPrefilter } = require('./trackingChatPrefilter');
const { openAiModerateText, mapOpenAiScoresToInternal } = require('./trackingChatOpenAiModerate');
const { mergeSignals, decideFinalAction, pointsDeltaForSeverity } = require('./trackingChatModerationEngine');

function hashText(t) {
  return crypto.createHash('sha256').update(String(t || ''), 'utf8').digest('hex');
}

function previewText(t, max) {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function getModState(meta) {
  const m = meta && typeof meta === 'object' && meta.trackingChatModState && typeof meta.trackingChatModState === 'object'
    ? meta.trackingChatModState
    : {};
  return {
    pointsClient: Math.max(0, Number(m.pointsClient) || 0),
    pointsTech: Math.max(0, Number(m.pointsTech) || 0),
  };
}

/**
 * @param {import('./trackingChatModerationPolicy').ModerationStage} stage
 * @param {string} actorRole
 * @param {import('./trackingChatModerationPolicy').ModerationSeverity} severity
 * @param {import('./trackingChatModerationPolicy').ModerationAction} action
 */
function bumpModState(meta, actorRole, severity, action) {
  const st = getModState(meta);
  let delta = 0;
  if (action === 'block' || action === 'request_rewrite') delta = pointsDeltaForSeverity(severity);
  else if (action === 'allow_warn') delta = pointsDeltaForSeverity('low');
  else if (severity === 'medium' || severity === 'high') delta = pointsDeltaForSeverity(severity);
  if (actorRole === 'client') st.pointsClient += delta;
  else st.pointsTech += delta;
  return st;
}

/**
 * @param {object} opts
 * @param {string} opts.text
 * @param {'client'|'tech'} opts.actorRole
 * @param {string} opts.executionId
 * @param {string|null|undefined} opts.tenantId
 * @param {Record<string, unknown>|null|undefined} opts.tenantFeatures
 * @param {Record<string, unknown>} opts.meta
 * @param {boolean} [opts.forceSend]
 */
async function runModerationPipeline(opts) {
  const policy = resolveEffectivePolicy(opts.tenantFeatures);
  const pre = runTrackingChatPrefilter(opts.text, null);
  let openAiRes = null;
  let openAiMapped = null;
  try {
    openAiRes = await openAiModerateText(opts.text, policy.iaTimeoutMs);
    if (openAiRes && openAiRes.category_scores && typeof openAiRes.category_scores === 'object') {
      openAiMapped = mapOpenAiScoresToInternal(openAiRes.category_scores);
    }
  } catch (e) {
    openAiRes = { flagged: false, categories: {}, category_scores: {}, error: String(e.message || e) };
  }
  const sig = mergeSignals(pre, openAiRes, openAiMapped);
  const modState = getModState(opts.meta);
  const decision = decideFinalAction(
    policy.stage,
    sig,
    policy.blockHighConfidenceMin,
    !!opts.forceSend,
    modState,
    opts.actorRole
  );

  return {
    policy,
    pre,
    openAiRes,
    openAiMapped,
    sig,
    decision,
    modState,
  };
}

/**
 * @param {object} p
 * @param {string} p.executionId
 * @param {string|null} p.tenantId
 * @param {'client'|'tech'} p.actorRole
 * @param {string} p.text
 * @param {object} p.pipelineResult
 * @param {boolean} p.storeFullText
 */
async function persistModerationEvent(p) {
  const { executionId, tenantId, actorRole, text, pipelineResult, storeFullText } = p;
  const { pre, openAiRes, sig, decision, policy } = pipelineResult;
  const preview = storeFullText ? previewText(text, 200) : previewText(text, 120);
  try {
    await prisma.trackingChatModerationEvent.create({
      data: {
        executionId,
        tenantId: tenantId || null,
        actorRole,
        textHash: hashText(text),
        textLength: String(text || '').length,
        textPreview: preview || null,
        category: sig.category,
        severity: sig.severity,
        confidence: sig.confidence,
        prefilterJson: pre,
        iaJson: openAiRes
          ? {
              flagged: openAiRes.flagged,
              error: openAiRes.error || null,
              categories: openAiRes.categories,
              category_scores: openAiRes.category_scores,
            }
          : undefined,
        finalAction: decision.finalAction,
        stageAtTime: policy.stage,
        needsHumanReview: !!decision.needsHumanReview,
      },
    });
  } catch (e) {
    console.warn('[trackingChatPipeline] audit insert failed:', e.message || e);
  }
}

module.exports = {
  runModerationPipeline,
  persistModerationEvent,
  getModState,
  bumpModState,
  hashText,
  COPY,
};
