/**
 * Tema visual do PDF — partilhado entre construtor e operations print.
 */

export const DEFAULT_THEME = {
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontScale: 1,
  colorText: '#0f172a',
  colorMuted: '#64748b',
  colorMutedLight: '#94a3b8',
  colorBorder: '#e2e8f0',
  colorSurface: '#f8fafc',
  colorAccent: '#3b82f6',
  colorAccentDark: '#1e40af',
  bannerGradientStart: '#1e3a8a',
  bannerGradientEnd: '#1e40af',
  techHeaderStart: '#1e293b',
  techHeaderEnd: '#334155',
  formNumBg: '#F97316',
  pillYesBg: '#3b82f6',
  pillNoBg: '#ef4444',
  timelineBlue: '#3b82f6',
  timelineGreen: '#22c55e',
  timelineOrange: '#EA580C',
  colDispatch: '#2563eb',
  colDispatchBg: '#f8faff',
  colExec: '#16a34a',
  colExecBg: '#f0fdf4',
  transitAccent: '#EA580C',
  photoAccent: '#10b981',
  topbarBadgeBg: '#f1f5f9',
};

function isHexColor(s) {
  return typeof s === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s.trim());
}

export function sanitizeHex(s, fallback) {
  const t = s != null ? String(s).trim() : '';
  return isHexColor(t) ? t : fallback;
}

export function sanitizeFontFamily(s) {
  const t = String(s || '')
    .replace(/[;{}<>]/g, '')
    .trim()
    .slice(0, 220);
  return t || DEFAULT_THEME.fontFamily;
}

export function sanitizeFontScale(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.min(1.35, Math.max(0.75, x));
}

/**
 * @param {object|null|undefined} raw
 */
export function mergeTheme(raw) {
  const out = { ...DEFAULT_THEME };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  out.fontFamily = sanitizeFontFamily(raw.fontFamily ?? out.fontFamily);
  out.fontScale = sanitizeFontScale(raw.fontScale ?? out.fontScale);
  out.colorText = sanitizeHex(raw.colorText, out.colorText);
  out.colorMuted = sanitizeHex(raw.colorMuted, out.colorMuted);
  out.colorMutedLight = sanitizeHex(raw.colorMutedLight, out.colorMutedLight);
  out.colorBorder = sanitizeHex(raw.colorBorder, out.colorBorder);
  out.colorSurface = sanitizeHex(raw.colorSurface, out.colorSurface);
  out.colorAccent = sanitizeHex(raw.colorAccent, out.colorAccent);
  out.colorAccentDark = sanitizeHex(raw.colorAccentDark, out.colorAccentDark);
  out.bannerGradientStart = sanitizeHex(raw.bannerGradientStart, out.bannerGradientStart);
  out.bannerGradientEnd = sanitizeHex(raw.bannerGradientEnd, out.bannerGradientEnd);
  out.techHeaderStart = sanitizeHex(raw.techHeaderStart, out.techHeaderStart);
  out.techHeaderEnd = sanitizeHex(raw.techHeaderEnd, out.techHeaderEnd);
  out.formNumBg = sanitizeHex(raw.formNumBg, out.formNumBg);
  out.pillYesBg = sanitizeHex(raw.pillYesBg, out.pillYesBg);
  out.pillNoBg = sanitizeHex(raw.pillNoBg, out.pillNoBg);
  out.timelineBlue = sanitizeHex(raw.timelineBlue, out.timelineBlue);
  out.timelineGreen = sanitizeHex(raw.timelineGreen, out.timelineGreen);
  out.timelineOrange = sanitizeHex(raw.timelineOrange, out.timelineOrange);
  out.colDispatch = sanitizeHex(raw.colDispatch, out.colDispatch);
  out.colDispatchBg = sanitizeHex(raw.colDispatchBg, out.colDispatchBg);
  out.colExec = sanitizeHex(raw.colExec, out.colExec);
  out.colExecBg = sanitizeHex(raw.colExecBg, out.colExecBg);
  out.transitAccent = sanitizeHex(raw.transitAccent, out.transitAccent);
  out.photoAccent = sanitizeHex(raw.photoAccent, out.photoAccent);
  out.topbarBadgeBg = sanitizeHex(raw.topbarBadgeBg, out.topbarBadgeBg);
  return out;
}

/** Escapa valor para style="..." */
export function escCssValue(s) {
  return String(s).replace(/"/g, "'");
}
