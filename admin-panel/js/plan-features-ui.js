'use strict';

/** Chaves booleanas conhecidas em `Plan.features` (painel). */
export const PLAN_FEATURE_BOOL_KEYS = [
  'stock',
  'vault',
  'ai',
  'documents',
  'insurance',
  'reports',
  'realtime',
];

const FACIAL_VALUES = ['COMPREFACE', 'AWS', 'AUTO'];

export function defaultPlanFeaturesForNew() {
  return {
    stock: true,
    vault: false,
    ai: false,
    documents: true,
    insurance: false,
    reports: false,
    realtime: false,
    facialVisionProvider: 'COMPREFACE',
    branding: {
      enabled: false,
      allowLogo: false,
      allowColors: false,
      allowLoginScreen: false,
      allowAppDisplayName: false,
    },
  };
}

const BRANDING_BOOL_KEYS = [
  'enabled',
  'allowLogo',
  'allowColors',
  'allowLoginScreen',
  'allowAppDisplayName',
];

function readBrandingFeature(feat) {
  const raw = feat && typeof feat === 'object' && !Array.isArray(feat) ? feat.branding : null;
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    enabled: !!src.enabled,
    allowLogo: !!src.allowLogo,
    allowColors: !!src.allowColors,
    allowLoginScreen: !!src.allowLoginScreen,
    allowAppDisplayName: !!src.allowAppDisplayName,
  };
}

/**
 * Preenche interruptores, select de motor facial e textarea «extras» (só chaves não mapeadas na UI).
 * @param {Record<string, unknown>|null|undefined} feat
 */
export function writePlanFeaturesToDom(feat) {
  const f = feat && typeof feat === 'object' && !Array.isArray(feat) ? { ...feat } : {};
  for (const key of PLAN_FEATURE_BOOL_KEYS) {
    const el = document.getElementById(`plan-feat-${key}`);
    if (el && el.type === 'checkbox') el.checked = !!f[key];
  }
  const sel = document.getElementById('plan-feat-facial-provider');
  if (sel) {
    const v = String(f.facialVisionProvider ?? 'COMPREFACE')
      .trim()
      .toUpperCase();
    sel.value = FACIAL_VALUES.includes(v) ? v : 'COMPREFACE';
  }
  const branding = readBrandingFeature(f);
  for (const key of BRANDING_BOOL_KEYS) {
    const el = document.getElementById(`plan-feat-branding-${key}`);
    if (el && el.type === 'checkbox') el.checked = !!branding[key];
  }
  const extra = { ...f };
  for (const key of PLAN_FEATURE_BOOL_KEYS) delete extra[key];
  delete extra.facialVisionProvider;
  delete extra.branding;
  const ta = document.getElementById('plan-features-advanced');
  if (ta) ta.value = Object.keys(extra).length ? JSON.stringify(extra, null, 2) : '';
}

/**
 * Monta o objeto `features` a enviar à API (UI + JSON avançado mesclados).
 * @returns {Record<string, unknown>}
 * @throws {{ code: 'INVALID_ADVANCED_JSON' }} se o JSON avançado for inválido
 */
export function readPlanFeaturesFromDom() {
  const out = {};
  for (const key of PLAN_FEATURE_BOOL_KEYS) {
    const el = document.getElementById(`plan-feat-${key}`);
    if (el && el.type === 'checkbox') out[key] = !!el.checked;
  }
  const sel = document.getElementById('plan-feat-facial-provider');
  if (sel) {
    const v = String(sel.value || 'COMPREFACE').trim().toUpperCase();
    out.facialVisionProvider = FACIAL_VALUES.includes(v) ? v : 'COMPREFACE';
  }
  const branding = {};
  for (const key of BRANDING_BOOL_KEYS) {
    const el = document.getElementById(`plan-feat-branding-${key}`);
    if (el && el.type === 'checkbox') branding[key] = !!el.checked;
  }
  out.branding = branding;
  const ta = document.getElementById('plan-features-advanced');
  if (ta && ta.value.trim()) {
    let extra;
    try {
      extra = JSON.parse(ta.value);
    } catch {
      const err = new Error('invalid');
      err.code = 'INVALID_ADVANCED_JSON';
      throw err;
    }
    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) extra = {};
    for (const key of [...PLAN_FEATURE_BOOL_KEYS, 'facialVisionProvider', 'branding']) delete extra[key];
    Object.assign(out, extra);
  }
  return out;
}
