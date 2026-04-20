'use strict';

/**
 * Escolhe o backend de «Visão IA — detecção» (Moondream vs proxy YOLO).
 *
 * Regras:
 * - `tenant.features.visionDetectionEngine === 'moondream'` → Moondream se houver API key; senão YOLO se houver URL.
 * - Idem `'yolo'` na ordem inversa.
 * - Sem preferência explícita: só Moondream → Moondream; só YOLO → YOLO;
 *   **se ambos configurados → Moondream** (API cloud por defeito; YOLO exige flag explícita `yolo`).
 *
 * @param {Record<string, unknown> | null | undefined} tenantFeatures
 * @param {{ yoloOk: boolean, moonOk: boolean }} caps
 * @returns {{ useMoondream: boolean }}
 */
function pickVisionDetectionBackend(tenantFeatures, caps) {
  const tf =
    tenantFeatures && typeof tenantFeatures === 'object' && !Array.isArray(tenantFeatures) ? tenantFeatures : {};
  const vde = String(tf.visionDetectionEngine || '').trim().toLowerCase();
  const { yoloOk, moonOk } = caps;

  if (vde === 'moondream') {
    if (moonOk) return { useMoondream: true };
    if (yoloOk) return { useMoondream: false };
    return { useMoondream: false };
  }
  if (vde === 'yolo') {
    if (yoloOk) return { useMoondream: false };
    if (moonOk) return { useMoondream: true };
    return { useMoondream: false };
  }

  if (moonOk && !yoloOk) return { useMoondream: true };
  if (yoloOk && !moonOk) return { useMoondream: false };
  if (moonOk && yoloOk) return { useMoondream: true };

  return { useMoondream: false };
}

/**
 * Rótulo `tenant.visionDetectionEngine` no payload do app, alinhado ao mesmo critério de
 * `pickVisionDetectionBackend` (inclui integrações globais na BD).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Record<string, unknown> | null | undefined} tenantFeatures
 * @returns {Promise<'moondream'|'yolo'>}
 */
async function resolveVisionDetectionEngineLabelForApp(prisma, tenantFeatures) {
  const { prismaWhereVisionChecklistIntegration } = require('./visionChecklistAnalyze');
  const { findMoondreamIntegration } = require('./visionMoondreamAnalyze');
  const yoloIntegration = await prisma.integration.findFirst({
    where: prismaWhereVisionChecklistIntegration(),
  });
  const yoloOk = !!(yoloIntegration && String(yoloIntegration.baseUrl || '').trim());
  const moonIntegration = await findMoondreamIntegration();
  const moonOk = !!(moonIntegration && String(moonIntegration.apiKey || '').trim());
  const { useMoondream } = pickVisionDetectionBackend(tenantFeatures, { yoloOk, moonOk });
  return useMoondream ? 'moondream' : 'yolo';
}

module.exports = {
  pickVisionDetectionBackend,
  resolveVisionDetectionEngineLabelForApp,
};
