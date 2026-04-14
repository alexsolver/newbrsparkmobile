'use strict';

/**
 * Política de moderação do chat de acompanhamento (OS / link público).
 *
 * Rollout (não travar a operação):
 *   TRACKING_CHAT_MODERATION_STAGE = observe | warn | block_partial | full
 *   (padrão: observe — só classifica e regista; não bloqueia.)
 *
 * Override por tenant: `Tenant.features.trackChatModeration` = {
 *   stage?, blockHighConfidenceMin?, iaTimeoutMs?, storeFullText?: boolean
 * }
 *
 * Outras env:
 *   TRACKING_CHAT_MOD_IA_TIMEOUT_MS (default 2500)
 *   TRACKING_CHAT_MOD_BLOCK_CONFIDENCE (default 0.75) — block_partial / full
 *   TRACKING_CHAT_MOD_RETENTION_DAYS (default 90) — documentação TTL; job por implementar
 */

/** @typedef {'observe'|'warn'|'block_partial'|'full'} ModerationStage */
/** @typedef {'offensive'|'harassment'|'threat'|'discrimination'|'sexual'|'contact_solicitation'|'spam'} ModerationCategory */
/** @typedef {'low'|'medium'|'high'} ModerationSeverity */
/** @typedef {'allow'|'allow_warn'|'request_rewrite'|'block'|'escalate_review'} ModerationAction */

const STAGES = /** @type {const} */ (['observe', 'warn', 'block_partial', 'full']);

const CATEGORIES = /** @type {const} */ ([
  'offensive',
  'harassment',
  'threat',
  'discrimination',
  'sexual',
  'contact_solicitation',
  'spam',
]);

const ACTIONS = /** @type {const} */ (['allow', 'allow_warn', 'request_rewrite', 'block', 'escalate_review']);

const SCORE_BY_SEVERITY = { low: 1, medium: 3, high: 10 };

const THRESHOLD_ALERT = 3;
const THRESHOLD_LIMIT = 6;
const THRESHOLD_REVIEW = 10;

/** Mensagens pt-BR (produto). */
const COPY = {
  conductBanner:
    'Este chat é monitorado para segurança e qualidade. Mantenha respeito, evite ofensas, ameaças, assédio e partilha indevida de dados pessoais. As mensagens podem ser bloqueadas em caso de violação.',
  reminderLight:
    'Lembrete: mantenha uma comunicação respeitosa. Mensagens ofensivas ou abusivas podem ser bloqueadas.',
  requestRewrite:
    'A sua mensagem parece violar as regras de conduta. Revise o texto antes de enviar.',
  blockHard:
    'Esta mensagem não foi enviada porque viola as regras de conduta da plataforma.',
  recurrence:
    'Atenção: novas violações das regras do chat podem gerar bloqueio da conversa e análise da conta.',
  overrideHint:
    'Se considerar que foi um falso alarme leve, pode tentar enviar de novo confirmando abaixo.',
};

function parseStage(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (STAGES.includes(s)) return /** @type {ModerationStage} */ (s);
  return 'observe';
}

/**
 * @param {Record<string, unknown>|null|undefined} tenantFeatures
 * @returns {{ stage: ModerationStage, blockHighConfidenceMin: number, iaTimeoutMs: number, storeFullText: boolean }}
 */
function resolveEffectivePolicy(tenantFeatures) {
  const envStage = parseStage(process.env.TRACKING_CHAT_MODERATION_STAGE);
  let stage = envStage;
  let blockHighConfidenceMin = Math.min(
    0.99,
    Math.max(0.5, Number(process.env.TRACKING_CHAT_MOD_BLOCK_CONFIDENCE) || 0.75)
  );
  let iaTimeoutMs = Math.min(8000, Math.max(500, Number(process.env.TRACKING_CHAT_MOD_IA_TIMEOUT_MS) || 2500));
  let storeFullText = String(process.env.TRACKING_CHAT_MOD_STORE_FULLTEXT || '').trim() === '1';

  const sub =
    tenantFeatures && typeof tenantFeatures === 'object' && !Array.isArray(tenantFeatures)
      ? tenantFeatures.trackChatModeration
      : null;
  if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
    if (typeof sub.stage === 'string' && STAGES.includes(sub.stage.trim().toLowerCase())) {
      stage = /** @type {ModerationStage} */ (sub.stage.trim().toLowerCase());
    }
    if (sub.blockHighConfidenceMin != null && Number.isFinite(Number(sub.blockHighConfidenceMin))) {
      blockHighConfidenceMin = Math.min(0.99, Math.max(0.5, Number(sub.blockHighConfidenceMin)));
    }
    if (sub.iaTimeoutMs != null && Number.isFinite(Number(sub.iaTimeoutMs))) {
      iaTimeoutMs = Math.min(8000, Math.max(500, Number(sub.iaTimeoutMs)));
    }
    if (sub.storeFullText === true || sub.storeFullText === 'true') storeFullText = true;
  }

  return { stage, blockHighConfidenceMin, iaTimeoutMs, storeFullText };
}

module.exports = {
  STAGES,
  CATEGORIES,
  ACTIONS,
  SCORE_BY_SEVERITY,
  THRESHOLD_ALERT,
  THRESHOLD_LIMIT,
  THRESHOLD_REVIEW,
  COPY,
  parseStage,
  resolveEffectivePolicy,
};
