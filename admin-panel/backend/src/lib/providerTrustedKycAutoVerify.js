'use strict';

/**
 * Mescla dados de `responsesJson.technician` com a `ProviderIdentity` para o upsert de TechnicianProfile
 * (alinhado com POST /users/:id/provider-onboarding/approve, com preferência pelos campos do formulário).
 *
 * @param {{ score?: unknown, cft?: unknown, specialty?: unknown, skillsJson?: unknown }} pi
 * @param {unknown} responsesJson
 */
function buildTechnicianUpsertPayloadFromProviderIdentityAndResponses(pi, responsesJson) {
  const root = responsesJson && typeof responsesJson === 'object' && !Array.isArray(responsesJson) ? responsesJson : {};
  const tech =
    root.technician && typeof root.technician === 'object' && !Array.isArray(root.technician) ? root.technician : {};

  const fromTechScore = Number(tech.score);
  const fromPiScore = Number(pi.score);
  let score;
  if (Number.isFinite(fromTechScore) && fromTechScore >= 0 && fromTechScore <= 10) {
    score = fromTechScore;
  } else if (Number.isFinite(fromPiScore) && fromPiScore >= 0 && fromPiScore <= 10) {
    score = fromPiScore;
  }

  const cftFromTech = tech.cft != null && String(tech.cft).trim() ? String(tech.cft).trim() : undefined;
  const cftFromPi = pi.cft != null && String(pi.cft).trim() ? String(pi.cft).trim() : undefined;
  const cft = cftFromTech !== undefined ? cftFromTech : cftFromPi;

  const specFromTech = tech.specialty != null && String(tech.specialty).trim() ? String(tech.specialty).trim() : undefined;
  const specFromPi = pi.specialty != null && String(pi.specialty).trim() ? String(pi.specialty).trim() : undefined;
  const specialty = specFromTech !== undefined ? specFromTech : specFromPi;

  const skillsJson = tech.skillsJson !== undefined ? tech.skillsJson : pi.skillsJson != null ? pi.skillsJson : undefined;

  return { score, cft, specialty, skillsJson };
}

/**
 * KYC global aprovado + TechnicianProfile ACTIVE (fluxos de confiança: submissão de onboarding na app,
 * aceite de convite de vínculo pela empresa, ou aprovação manual no painel).
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {{ userId: string, providerIdentityId: string, responsesJson?: unknown }} opts
 */
async function trustedAutoVerifyProviderKycInTx(tx, opts) {
  const userId = String(opts.userId || '').trim();
  const providerIdentityId = String(opts.providerIdentityId || '').trim();
  if (!userId || !providerIdentityId) {
    throw new Error('trustedAutoVerifyProviderKycInTx: userId e providerIdentityId são obrigatórios.');
  }

  const pi = await tx.providerIdentity.findUnique({
    where: { id: providerIdentityId },
    select: { id: true, userId: true, score: true, cft: true, specialty: true, skillsJson: true },
  });
  if (!pi) throw new Error('ProviderIdentity não encontrada.');
  if (String(pi.userId) !== userId) {
    throw new Error('ProviderIdentity não pertence a este utilizador.');
  }

  const now = new Date();
  const merged = buildTechnicianUpsertPayloadFromProviderIdentityAndResponses(pi, opts.responsesJson);

  await tx.providerIdentity.update({
    where: { id: pi.id },
    data: {
      kycStatus: 'APPROVED',
      globalStatus: 'VERIFIED',
      kycReviewedAt: now,
      kycReviewNote: null,
    },
  });

  await tx.technicianProfile.upsert({
    where: { userId },
    create: {
      userId,
      status: 'ACTIVE',
      score: merged.score ?? 5,
      cft: merged.cft ?? null,
      specialty: merged.specialty ?? null,
      ...(merged.skillsJson !== undefined ? { skillsJson: merged.skillsJson } : {}),
    },
    update: {
      status: 'ACTIVE',
      ...(merged.score !== undefined ? { score: merged.score } : {}),
      ...(merged.cft !== undefined ? { cft: merged.cft } : {}),
      ...(merged.specialty !== undefined ? { specialty: merged.specialty } : {}),
      ...(merged.skillsJson !== undefined ? { skillsJson: merged.skillsJson } : {}),
    },
  });
}

module.exports = {
  trustedAutoVerifyProviderKycInTx,
  buildTechnicianUpsertPayloadFromProviderIdentityAndResponses,
};
