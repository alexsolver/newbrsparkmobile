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
  /** Chips / menus horizontais (filtros) — opcionais; vazios = derivar de destaque/primária no app. */
  menuChipActiveBg: '',
  menuChipActiveFg: '',
  menuChipInactiveBg: '',
  menuChipInactiveFg: '',
  menuChipInactiveBorder: '',
  logoLightUrl: '',
  logoDarkUrl: '',
  /** Logo só da página de login (app); vazio = mesmo que logos gerais. */
  loginPageLogoUrl: '',
  /** Fundo sólido do bloco de topo do login (app) — vazio = fundo padrão do tema. */
  loginBackgroundColor: '',
  /** Fundo da barra global (logo + alertas + avatar). */
  appHeaderBackgroundColor: '',
  liveActivityBadgeKey: '',
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
  if (/^(https?:)?\/\//i.test(s) || s.startsWith('/uploads/') || s.startsWith('/storage/')) return s;
  return '';
}

function asHexColor(v) {
  const s = asTrimmedString(v, 32).toUpperCase();
  if (!s) return '';
  return /^#([0-9A-F]{6}|[0-9A-F]{8})$/.test(s) ? s : '';
}

function asLiveActivityBadgeKey(v) {
  const s = asTrimmedString(v, 80);
  if (!s) return '';
  return s === 'brspark-badge' ? s : '';
}

function brandingValidationIssues(branding, permissions) {
  const out = [];
  const b = isPlainObject(branding) ? branding : {};
  const p = sanitizeBrandingPermissions(permissions);
  if (!p.enabled && b.enabled) {
    out.push('O plano atual não permite ativar branding para este tenant.');
  }
  if (p.allowLogo && b.enabled) {
    if (!asOptionalUrl(b.logoLightUrl) && !asOptionalUrl(b.logoDarkUrl)) {
      out.push('Informe pelo menos um logo válido (claro ou escuro).');
    }
  }
  if (p.allowColors && b.enabled) {
    if (!asHexColor(b.primaryColor) && !asHexColor(b.accentColor)) {
      out.push('Informe ao menos uma cor válida de marca (#RRGGBB).');
    }
  }
  return out;
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

/**
 * Espelho CMS (`cmsBrandingMirror`) + `features.branding` do tenant.
 * Cada chave presente em `tenantBranding` substitui o mirror — **incluindo `''`**
 * (ex.: slogan limpo no painel deve apagar o slogan vindo do CMS; antes
 * `stripEmptyStringKeys` removia a chave e o mirror «ganhava»).
 */
function overlayTenantBrandingOnMirror(mirror, tenantBranding) {
  const m = isPlainObject(mirror) ? { ...mirror } : {};
  const t = isPlainObject(tenantBranding) ? tenantBranding : {};
  for (const key of Object.keys(t)) {
    m[key] = t[key];
  }
  return m;
}

/** iOS ATS bloqueia `http://` na App Store; o mesmo asset em `https://` responde 200 em produção. */
function forceHttpsOnPublicAssetUrl(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (!/^http:\/\//i.test(s)) return s;
  let host = '';
  try {
    host = new URL(s).hostname.toLowerCase();
  } catch {
    return s;
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return s;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return s;
  const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (m) {
    const sec = Number(m[1]);
    if (sec >= 16 && sec <= 31) return s;
  }
  return `https://${s.slice('http://'.length)}`;
}

/**
 * O app móvel (App Store) junta URLs relativas a `API_BASE` (API Node, ex. api.*).
 * Ficheiros em `/storage/*` vivem no CMS Laravel (outro host). Sem origem absoluta o iOS pede
 * `https://api…/storage/…` e recebe 404 — o logo cai no fallback BrSpark.
 *
 * Defina no .env da API Node (produção): `BRSPARK_CMS_PUBLIC_URL` ou `LARAVEL_APP_URL` = origem
 * pública do Laravel (ex. https://app.cliente.com), sem barra no fim.
 */
function absolutizePublicMediaUrlForMobile(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return forceHttpsOnPublicAssetUrl(s);
  if (s.startsWith('//')) return forceHttpsOnPublicAssetUrl(`https:${s}`);
  if (s.startsWith('/storage/')) {
    const origin = String(
      process.env.BRSPARK_CMS_PUBLIC_URL ||
        process.env.LARAVEL_APP_URL ||
        process.env.BRSPARK_LARAVEL_BASE_URL ||
        process.env.CMS_DIRECTORY_BASE_URL ||
        process.env.CMS_PUBLIC_URL ||
        process.env.APP_URL ||
        '',
    )
      .trim()
      .replace(/\/+$/, '');
    if (origin) return forceHttpsOnPublicAssetUrl(`${origin}${s}`);
  }
  return forceHttpsOnPublicAssetUrl(s);
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
    menuChipActiveBg: ent.allowColors ? asHexColor(src.menuChipActiveBg) : '',
    menuChipActiveFg: ent.allowColors ? asHexColor(src.menuChipActiveFg) : '',
    menuChipInactiveBg: ent.allowColors ? asHexColor(src.menuChipInactiveBg) : '',
    menuChipInactiveFg: ent.allowColors ? asHexColor(src.menuChipInactiveFg) : '',
    menuChipInactiveBorder: ent.allowColors ? asHexColor(src.menuChipInactiveBorder) : '',
    logoLightUrl: ent.allowLogo ? asOptionalUrl(src.logoLightUrl) : '',
    logoDarkUrl: ent.allowLogo ? asOptionalUrl(src.logoDarkUrl) : '',
    loginPageLogoUrl: ent.allowLogo ? asOptionalUrl(src.loginPageLogoUrl) : '',
    loginBackgroundColor: ent.allowLoginScreen ? asHexColor(src.loginBackgroundColor) : '',
    appHeaderBackgroundColor: ent.allowColors ? asHexColor(src.appHeaderBackgroundColor) : '',
    /** Legado: imagem de fundo removida; forçar remoção no JSON do tenant. */
    loginBackgroundUrl: '',
    liveActivityBadgeKey: asLiveActivityBadgeKey(src.liveActivityBadgeKey),
    brandingVersion: Number.isFinite(Number(src.brandingVersion)) ? Number(src.brandingVersion) : 0,
    updatedAt: src.updatedAt ? new Date(src.updatedAt).toISOString() : null,
  };
  return out;
}

function buildEffectiveTenantBranding({ tenantName, planFeatures, tenantFeatures }) {
  const permissions = readBrandingPermissionsFromPlanFeatures(planFeatures);
  const mirror = isPlainObject(tenantFeatures?.cmsBrandingMirror) ? tenantFeatures.cmsBrandingMirror : {};
  const tenantBrandingRaw =
    isPlainObject(tenantFeatures) && isPlainObject(tenantFeatures.branding) ? tenantFeatures.branding : {};
  const mergedRaw = overlayTenantBrandingOnMirror(mirror, tenantBrandingRaw);
  const saved = sanitizeTenantBranding(mergedRaw, permissions);
  const effective = {
    ...BRANDING_DEFAULTS,
    ...saved,
    enabled: permissions.enabled && saved.enabled,
    appDisplayName: saved.appDisplayName || asTrimmedString(tenantName, 80),
    tagline: saved.tagline || '',
    logoLightUrl: absolutizePublicMediaUrlForMobile(saved.logoLightUrl || ''),
    logoDarkUrl: absolutizePublicMediaUrlForMobile(
      saved.logoDarkUrl || saved.logoLightUrl || '',
    ),
    loginPageLogoUrl: absolutizePublicMediaUrlForMobile(saved.loginPageLogoUrl || ''),
    /** Legado: imagem de fundo deixou de ser usada no app; manter vazio. */
    loginBackgroundUrl: '',
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
  brandingValidationIssues,
  buildEffectiveTenantBranding,
  mergeTenantFeaturesWithBranding,
};
