'use strict';

const BRANDING_PERMISSION_DEFAULTS = Object.freeze({
  enabled: false,
  allowLogo: false,
  allowColors: false,
  allowLoginScreen: false,
  allowAppDisplayName: false,
});

const BRANDING_DEFAULTS = Object.freeze({
  enabled: false,
  appDisplayName: '',
  tagline: '',
  primaryColor: '',
  accentColor: '',
  secondaryColor: '',
  surfaceColor: '',
  logoLightUrl: '',
  logoDarkUrl: '',
  loginBackgroundUrl: '',
  brandingVersion: 0,
  updatedAt: null,
});

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function asTrimmedString(v, maxLen = 400) {
  if (v == null) return '';
  const s = String(v).trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function asOptionalUrl(v) {
  const s = asTrimmedString(v, 1200);
  if (!s) return '';
  if (/^(https?:)?\/\//i.test(s) || s.startsWith('/uploads/')) return s;
  return '';
}

function asHexColor(v) {
  const s = asTrimmedString(v, 32).toUpperCase();
  if (!s) return '';
  return /^#([0-9A-F]{6}|[0-9A-F]{8})$/.test(s) ? s : '';
}

function sanitizeBrandingPermissions(raw) {
  const src = isPlainObject(raw) ? raw : {};
  return {
    enabled: !!src.enabled,
    allowLogo: !!src.allowLogo,
    allowColors: !!src.allowColors,
    allowLoginScreen: !!src.allowLoginScreen,
    allowAppDisplayName: !!src.allowAppDisplayName,
  };
}

function readBrandingPermissionsFromPlanFeatures(planFeatures) {
  const feat = isPlainObject(planFeatures) ? planFeatures : {};
  const raw = isPlainObject(feat.branding) ? feat.branding : {};
  return sanitizeBrandingPermissions({ ...BRANDING_PERMISSION_DEFAULTS, ...raw });
}

function sanitizeTenantBranding(raw, permissions) {
  const src = isPlainObject(raw) ? raw : {};
  const ent = sanitizeBrandingPermissions(permissions);
  const out = {
    enabled: ent.enabled ? !!src.enabled : false,
    appDisplayName: ent.allowAppDisplayName ? asTrimmedString(src.appDisplayName, 80) : '',
    tagline: ent.allowAppDisplayName ? asTrimmedString(src.tagline, 120) : '',
    primaryColor: ent.allowColors ? asHexColor(src.primaryColor) : '',
    accentColor: ent.allowColors ? asHexColor(src.accentColor) : '',
    secondaryColor: ent.allowColors ? asHexColor(src.secondaryColor) : '',
    surfaceColor: ent.allowColors ? asHexColor(src.surfaceColor) : '',
    logoLightUrl: ent.allowLogo ? asOptionalUrl(src.logoLightUrl) : '',
    logoDarkUrl: ent.allowLogo ? asOptionalUrl(src.logoDarkUrl) : '',
    loginBackgroundUrl: ent.allowLoginScreen ? asOptionalUrl(src.loginBackgroundUrl) : '',
    brandingVersion: Number.isFinite(Number(src.brandingVersion)) ? Number(src.brandingVersion) : 0,
    updatedAt: src.updatedAt ? new Date(src.updatedAt).toISOString() : null,
  };
  return out;
}

function buildEffectiveTenantBranding({ tenantName, planFeatures, tenantFeatures }) {
  const permissions = readBrandingPermissionsFromPlanFeatures(planFeatures);
  const tenantBrandingRaw =
    isPlainObject(tenantFeatures) && isPlainObject(tenantFeatures.branding) ? tenantFeatures.branding : {};
  const saved = sanitizeTenantBranding(tenantBrandingRaw, permissions);
  const effective = {
    ...BRANDING_DEFAULTS,
    ...saved,
    enabled: permissions.enabled && saved.enabled,
    appDisplayName: saved.appDisplayName || asTrimmedString(tenantName, 80),
    tagline: saved.tagline || '',
    logoLightUrl: saved.logoLightUrl || '',
    logoDarkUrl: saved.logoDarkUrl || saved.logoLightUrl || '',
  };
  return {
    permissions,
    saved,
    effective,
  };
}

function mergeTenantFeaturesWithBranding(existingFeatures, branding) {
  const base = isPlainObject(existingFeatures) ? { ...existingFeatures } : {};
  base.branding = branding;
  return base;
}

module.exports = {
  BRANDING_PERMISSION_DEFAULTS,
  BRANDING_DEFAULTS,
  readBrandingPermissionsFromPlanFeatures,
  sanitizeTenantBranding,
  buildEffectiveTenantBranding,
  mergeTenantFeaturesWithBranding,
};
