'use strict';

const {
  SCORE_BY_SEVERITY,
  THRESHOLD_ALERT,
  THRESHOLD_LIMIT,
  THRESHOLD_REVIEW,
  COPY,
} = require('./trackingChatModerationPolicy');

/**
 * @typedef {import('./trackingChatModerationPolicy').ModerationStage} ModerationStage
 * @typedef {import('./trackingChatModerationPolicy').ModerationSeverity} ModerationSeverity
 * @typedef {import('./trackingChatModerationPolicy').ModerationCategory} ModerationCategory
 * @typedef {import('./trackingChatModerationPolicy').ModerationAction} ModerationAction
 */

/**
 * @param {object} pre
 * @param {{ flagged: boolean, category_scores?: Record<string, number>, error?: string } | null} openAi
 * @param {{ category: string|null, severity: string, confidence: number } | null} openAiMapped
 */
function mergeSignals(pre, openAi, openAiMapped) {
  let category =
    /** @type {string|null} */ (pre.suggestedCategory || (openAiMapped && openAiMapped.category) || null);
  let severity = /** @type {ModerationSeverity} */ ('low');
  let confidence = typeof pre.confidence === 'number' ? pre.confidence : 0;

  if (openAiMapped && openAiMapped.category) {
    category = openAiMapped.category;
    severity = /** @type {ModerationSeverity} */ (openAiMapped.severity || 'low');
    confidence = Math.max(confidence, openAiMapped.confidence || 0);
  } else if (pre.flags && pre.flags.length) {
    severity = /** @type {ModerationSeverity} */ (pre.suggestedSeverity || 'low');
  }

  if (openAi && openAi.flagged && openAiMapped && openAiMapped.severity === 'high') {
    severity = 'high';
  }

  if (!category && pre.flags.includes('spam')) category = 'spam';
  if (!category && pre.flags.length) category = 'offensive';

  return { category, severity, confidence };
}

/**
 * @param {ModerationStage} stage
 * @param {{ category: string|null, severity: ModerationSeverity, confidence: number }} sig
 * @param {number} blockHighConfidenceMin
 * @param {boolean} forceSendAcknowledged
 * @param {{ pointsClient: number, pointsTech: number }} scores
 * @param {'client'|'tech'} actorRole
 */
function decideFinalAction(stage, sig, blockHighConfidenceMin, forceSendAcknowledged, scores, actorRole) {
  const { category, severity, confidence } = sig;
  const pts = actorRole === 'client' ? scores.pointsClient : scores.pointsTech;

  /** @type {{ finalAction: ModerationAction, canOverride: boolean, needsHumanReview: boolean, systemBanner: string|null, userMessage: string }} */
  const out = {
    finalAction: 'allow',
    canOverride: false,
    needsHumanReview: false,
    systemBanner: null,
    userMessage: '',
  };

  if (forceSendAcknowledged && category !== 'threat' && category !== 'sexual' && severity !== 'high') {
    if ((stage === 'warn' || stage === 'full') && severity === 'low') {
      out.finalAction = 'allow_warn';
      out.systemBanner = COPY.reminderLight;
      out.userMessage = '';
      return out;
    }
    if (stage === 'warn' && severity === 'medium' && confidence < 0.55 && category === 'offensive') {
      out.finalAction = 'allow_warn';
      out.systemBanner = COPY.reminderLight;
      out.userMessage = '';
      return out;
    }
    if (stage === 'block_partial' && severity === 'medium' && confidence < 0.62) {
      out.finalAction = 'allow_warn';
      out.systemBanner = COPY.reminderLight;
      out.userMessage = '';
      return out;
    }
  }

  // Reincidência: alerta global
  if (pts >= THRESHOLD_REVIEW) {
    out.systemBanner = out.systemBanner ? `${out.systemBanner}\n${COPY.recurrence}` : COPY.recurrence;
  } else if (pts >= THRESHOLD_LIMIT) {
    out.systemBanner = COPY.recurrence;
  }

  if (stage === 'observe') {
    out.finalAction = 'allow';
    if (severity !== 'low' || confidence > 0.25) {
      out.systemBanner = COPY.reminderLight;
    }
    return out;
  }

  if (stage === 'warn') {
    if (!category || severity === 'low') {
      if (confidence > 0.35) {
        out.finalAction = 'allow_warn';
        out.systemBanner = COPY.reminderLight;
      } else {
        out.finalAction = 'allow';
      }
      return out;
    }
    if (severity === 'medium') {
      out.finalAction = 'request_rewrite';
      out.userMessage = COPY.requestRewrite;
      out.canOverride = confidence < 0.55 && category === 'offensive';
      return out;
    }
    // high
    out.finalAction = 'block';
    out.userMessage = COPY.blockHard;
    return out;
  }

  if (stage === 'block_partial') {
    if (!category) return { ...out, finalAction: 'allow' };
    if (severity === 'high' && confidence >= blockHighConfidenceMin) {
      return { ...out, finalAction: 'block', userMessage: COPY.blockHard, needsHumanReview: true };
    }
    if (severity === 'medium' && confidence >= blockHighConfidenceMin) {
      return {
        ...out,
        finalAction: 'request_rewrite',
        userMessage: COPY.requestRewrite,
        canOverride: confidence < 0.62,
      };
    }
    if (severity === 'low' && confidence > 0.4) {
      return { ...out, finalAction: 'allow_warn', systemBanner: COPY.reminderLight };
    }
    return { ...out, finalAction: 'allow' };
  }

  // full
  if (!category) return { ...out, finalAction: 'allow' };
  if (severity === 'high' && confidence >= blockHighConfidenceMin - 0.05) {
    return { ...out, finalAction: 'block', userMessage: COPY.blockHard, needsHumanReview: true };
  }
  if (severity === 'medium' && confidence >= blockHighConfidenceMin - 0.1) {
    return { ...out, finalAction: 'request_rewrite', userMessage: COPY.requestRewrite };
  }
  if (pts >= THRESHOLD_ALERT) {
    return { ...out, finalAction: 'allow_warn', systemBanner: COPY.reminderLight };
  }
  return { ...out, finalAction: 'allow' };
}

function pointsDeltaForSeverity(severity) {
  return SCORE_BY_SEVERITY[severity] || SCORE_BY_SEVERITY.low;
}

module.exports = {
  mergeSignals,
  decideFinalAction,
  pointsDeltaForSeverity,
  THRESHOLD_ALERT,
  THRESHOLD_LIMIT,
  THRESHOLD_REVIEW,
};
