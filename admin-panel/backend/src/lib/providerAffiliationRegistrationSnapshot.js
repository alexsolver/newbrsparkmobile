'use strict';

/**
 * Campos do cadastro BrSpark que o tenant pode mostrar no onboarding web (só leitura).
 * Chaves gravadas em `Tenant.features.providerAffiliationOnboarding.includeIntegratedRegistrationFields`.
 */

const INTEGRATED_REGISTRATION_FIELDS = [
  { key: 'address', group: 'user', multiline: true, i18nKey: 'providerOnboard.integrated.address' },
  { key: 'personalDocuments', group: 'user', multiline: true, i18nKey: 'providerOnboard.integrated.personalDocuments' },
  { key: 'professionalDocuments', group: 'technician', multiline: true, i18nKey: 'providerOnboard.integrated.professionalDocuments' },
  { key: 'cft', group: 'technician', multiline: false, i18nKey: 'providerOnboard.integrated.cft' },
  { key: 'specialty', group: 'technician', multiline: false, i18nKey: 'providerOnboard.integrated.specialty' },
  { key: 'skills', group: 'technician', multiline: true, i18nKey: 'providerOnboard.integrated.skills' },
  { key: 'workSchedule', group: 'technician', multiline: true, i18nKey: 'providerOnboard.integrated.workSchedule' },
  { key: 'serviceCoverage', group: 'technician', multiline: true, i18nKey: 'providerOnboard.integrated.serviceCoverage' },
  { key: 'serviceLocations', group: 'technician', multiline: true, i18nKey: 'providerOnboard.integrated.serviceLocations' },
];

const INTEGRATED_KEY_SET = new Set(INTEGRATED_REGISTRATION_FIELDS.map((f) => f.key));

function fmtAddressJson(j) {
  if (!j || typeof j !== 'object' || Array.isArray(j)) return '';
  const parts = [j.line1, j.line2, j.district, j.city, j.stateUf, j.postal, j.country]
    .map((x) => (x != null && String(x).trim() !== '' ? String(x).trim() : null))
    .filter(Boolean);
  return parts.join('\n');
}

function fmtJson(val, maxLen) {
  const cap = typeof maxLen === 'number' ? maxLen : 12000;
  if (val == null || val === '') return '';
  try {
    const s = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
    if (s.length <= cap) return s;
    return `${s.slice(0, cap)}\n…`;
  } catch {
    return '';
  }
}

/**
 * @param {object|null} row — affiliation com providerIdentity.user (+ technicianProfile)
 * @returns {Record<string, string>}
 */
function buildRegistrationSnapshotFromRow(row) {
  const u = row?.providerIdentity?.user;
  const tp = u?.technicianProfile;
  const out = {};
  for (const { key } of INTEGRATED_REGISTRATION_FIELDS) {
    out[key] = '';
  }
  if (!u || typeof u !== 'object') return out;

  out.address = fmtAddressJson(u.addressJson);
  out.personalDocuments = fmtJson(u.personalDocuments);
  if (tp && typeof tp === 'object') {
    out.professionalDocuments = fmtJson(tp.professionalDocuments);
    out.cft = tp.cft != null ? String(tp.cft) : '';
    out.specialty = tp.specialty != null ? String(tp.specialty) : '';
    out.skills = fmtJson(tp.skillsJson);
    out.workSchedule = fmtJson(tp.workScheduleJson);
    out.serviceCoverage = fmtJson(tp.serviceCoverageGeoJson);
    out.serviceLocations = fmtJson(tp.serviceLocationIds);
  }
  return out;
}

function isIntegratedFieldKey(k) {
  return INTEGRATED_KEY_SET.has(String(k || '').trim());
}

module.exports = {
  INTEGRATED_REGISTRATION_FIELDS,
  INTEGRATED_KEY_SET,
  buildRegistrationSnapshotFromRow,
  isIntegratedFieldKey,
};
