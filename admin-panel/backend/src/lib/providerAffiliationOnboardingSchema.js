'use strict';

/**
 * Esquema de onboarding web por vínculo prestador↔empresa.
 * - Bloco obrigatório global (BrSpark): fotos / documento (URLs gravadas em `onboardingWeb`).
 * - Campos extra por tenant em `Tenant.features.providerAffiliationOnboarding`.
 * - Didit opcional: `Tenant.features.providerOnboardingDidit.enabled` + `workflowId`.
 */

const {
  INTEGRATED_REGISTRATION_FIELDS,
  isIntegratedFieldKey,
} = require('./providerAffiliationRegistrationSnapshot');

const DEFAULT_MANDATORY = [
  { id: 'aiGuidedPhoto', type: 'image', required: true, i18nKey: 'providerOnboard.mandatory.aiGuidedPhoto' },
  { id: 'faceMatch1', type: 'image', required: true, i18nKey: 'providerOnboard.mandatory.faceMatch1' },
  { id: 'faceMatch2', type: 'image', required: true, i18nKey: 'providerOnboard.mandatory.faceMatch2' },
  { id: 'idDocumentPhoto', type: 'image', required: true, i18nKey: 'providerOnboard.mandatory.idDocumentPhoto' },
];

/** Campos do `User` que podem ser mostrados no onboarding (só leitura, pré-preenchidos). */
const PROFILE_FIELD_KEYS = ['name', 'email', 'phone', 'avatarUrl'];

const integratedMetaByKey = new Map(INTEGRATED_REGISTRATION_FIELDS.map((f) => [f.key, f]));

function readFeaturesJson(features) {
  if (features && typeof features === 'object' && !Array.isArray(features)) return features;
  return {};
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<object|null>}
 */
async function loadMasterTenantFeatures(prisma) {
  const slug = String(process.env.BRSPARK_MASTER_TENANT_SLUG || 'master').trim().toLowerCase();
  const bySlug = await prisma.tenant.findFirst({
    where: { slug },
    select: { features: true },
  });
  if (bySlug) return readFeaturesJson(bySlug.features);
  const first = await prisma.tenant.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { features: true },
  });
  return first ? readFeaturesJson(first.features) : {};
}

/**
 * @param {object} tenant — { features }
 * @param {object|null} masterFeatures
 */
function resolveProviderAffiliationOnboardingDefinition(tenant, masterFeatures) {
  const tenantF = readFeaturesJson(tenant?.features);
  const masterF = masterFeatures && typeof masterFeatures === 'object' ? masterFeatures : {};

  const globalBlock = masterF.providerAffiliationOnboardingGlobal;
  const mandatoryFromMaster =
    globalBlock &&
    typeof globalBlock === 'object' &&
    Array.isArray(globalBlock.mandatorySteps) &&
    globalBlock.mandatorySteps.length
      ? globalBlock.mandatorySteps
      : DEFAULT_MANDATORY;

  const tenantBlock = tenantF.providerAffiliationOnboarding || {};
  const masterOnboardingGlobal = masterF.providerAffiliationOnboardingGlobal;
  const customFields = Array.isArray(tenantBlock.customFields) ? tenantBlock.customFields : [];

  const includeRaw = tenantBlock.includeProfileFields;
  const includeProfileFields = Array.isArray(includeRaw)
    ? includeRaw.map((k) => String(k || '').trim()).filter((k) => PROFILE_FIELD_KEYS.includes(k))
    : [];
  const profileFields = includeProfileFields.map((key) => ({
    key,
    readOnly: true,
    i18nKey: `providerOnboard.profile.${key}`,
  }));

  const integratedRaw = tenantBlock.includeIntegratedRegistrationFields;
  const includeIntegratedRegistrationFields = Array.isArray(integratedRaw)
    ? integratedRaw.map((k) => String(k || '').trim()).filter(isIntegratedFieldKey)
    : [];
  const integratedFields = includeIntegratedRegistrationFields.map((key) => {
    const m = integratedMetaByKey.get(key);
    return {
      key,
      readOnly: true,
      i18nKey: m ? m.i18nKey : `providerOnboard.integrated.${key}`,
      group: m ? m.group : 'user',
      multiline: !!(m && m.multiline),
    };
  });

  const diditMaster = masterF.providerOnboardingDidit || {};
  const diditTenant = tenantF.providerOnboardingDidit || {};
  const didit = {
    enabled: !!(diditTenant.enabled === true || (diditMaster.enabled === true && diditTenant.enabled !== false)),
    workflowId:
      (typeof diditTenant.workflowId === 'string' && diditTenant.workflowId.trim()) ||
      (typeof diditMaster.workflowId === 'string' && diditMaster.workflowId.trim()) ||
      String(process.env.DIDIT_WORKFLOW_ID || '').trim() ||
      null,
  };

  const skipFace =
    didit.enabled === true ||
    tenantBlock.skipFaceVerificationOnSubmit === true ||
    (masterOnboardingGlobal && masterOnboardingGlobal.skipFaceVerificationOnSubmit === true);

  return {
    mandatorySteps: mandatoryFromMaster,
    customFields,
    profileFields,
    includeProfileFields,
    integratedFields,
    includeIntegratedRegistrationFields,
    didit,
    /** CompreFace: comparar fotos obrigatórias no submit (desactivado com Didit ou flag). */
    faceVerificationOnSubmit: !skipFace,
  };
}

module.exports = {
  DEFAULT_MANDATORY,
  PROFILE_FIELD_KEYS,
  INTEGRATED_REGISTRATION_FIELDS,
  resolveProviderAffiliationOnboardingDefinition,
  loadMasterTenantFeatures,
};
