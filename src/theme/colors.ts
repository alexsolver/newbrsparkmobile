/**
 * Tags de mídia — único conjunto para app (tabs/media, MediaModule, etc.).
 */
export const MEDIA_TAG_COLORS: Record<string, string> = {
  BEFORE: '#3B82F6',
  DURING: '#F59E0B',
  AFTER: '#10B981',
  DAMAGE: '#EF4444',
  WARRANTY: '#8B5CF6',
  OTHER: '#6B7280',
};

/**
 * Categorias de serviço por id (index, services, mapas).
 * Inclui chaves extras usadas apenas na aba Prestador.
 */
/** Cores do segmento SERVIÇOS / BENS / PRESTADOR no header */
export const MODE_SEGMENT_COLORS = {
  SERVICES: '#10B981',
  ASSETS: '#3B82F6',
  PROVIDER: '#D97706',
} as const;

export const SERVICE_CATEGORY_COLORS: Record<string, string> = {
  all: '#904D00',
  Elétrica: '#F59E0B',
  Hidráulica: '#3B82F6',
  Limpeza: '#10B981',
  Reformas: '#8B5CF6',
  Jardinagem: '#22C55E',
  Segurança: '#EF4444',
  Climatização: '#06B6D4',
  Tecnologia: '#6366F1',
  Dedetização: '#F97316',
  Mudança: '#EC4899',
  Gás: '#84CC16',
  Pintura: '#A855F7',
};

const statusLight = {
  success: { fg: '#059669', bg: '#D1FAE5', border: '#A7F3D0' },
  warning: { fg: '#C2410C', bg: '#FFEDD5', border: '#FDBA74' },
  danger: { fg: '#B91C1C', bg: '#FEE2E2', border: '#FECACA' },
  info: { fg: '#1D4ED8', bg: '#DBEAFE', border: '#93C5FD' },
};

const statusDark = {
  success: { fg: '#4ADE80', bg: '#14532D', border: '#166534' },
  warning: { fg: '#FDBA74', bg: '#5E3000', border: '#9A3412' },
  danger: { fg: '#FCA5A5', bg: '#450A0A', border: '#7F1D1D' },
  info: { fg: '#93C5FD', bg: '#1E3A8A', border: '#1D4ED8' },
};

export const lightColors = {
  primary: '#F97316',
  accent: '#EA580C',
  branding: '#F97316',
  slate: '#0F172A',
  background: '#F8F9FA',
  surfaceLow: '#F3F4F5',
  cardWhite: '#FFFFFF',
  textSecondary: '#475569',
  /** Metadados / placeholders — escurecido vs #94A3B8 para melhor AA em fundo claro */
  textLight: '#64748B',
  border: '#E2E8F0',
  success: { background: '#D1FAE5', text: '#059669' },
  warning: { background: '#FFEDD5', text: '#EA580C' },
  divider: '#F1F5F9',
  status: statusLight,
  connectivity: {
    checking: '#64748B',
    online: '#10B981',
    offline: '#EF4444',
  },
  destructive: '#DC2626',
  gpsAura: {
    ring: '#FACC15',
    shadow: '#CA8A04',
  },
  switch: {
    trackOff: '#E2E8F0',
    trackOn: 'rgba(249, 115, 22, 0.35)',
    thumb: '#FFFFFF',
  },
  /**
   * Botões retangulares "ink" (Guardar, Voltar cheio, chips ativos escuros).
   * Nunca usar `slate` como fundo: em dark o slate é cor de texto clara.
   */
  filledButtonBg: '#0F172A',
  filledButtonFg: '#FFFFFF',
  /** Barras/modais que devem permanecer escuros em qualquer tema */
  overlayDark: '#0F172A',
  onOverlayDark: '#FFFFFF',
};

export const darkColors = {
  /** Mesma cor de marca que no light — evita fundos "claros" invisíveis com texto branco */
  primary: '#F97316',
  accent: '#FFB84D',
  branding: '#F97316',
  slate: '#F8F9FA',
  background: '#191C1D',
  surfaceLow: '#222526',
  cardWhite: '#282B2C',
  textSecondary: '#8B9193',
  textLight: '#565E61',
  border: '#2D3132',
  success: { background: '#003930', text: '#4DB6AC' },
  warning: { background: '#5E3000', text: '#FFCC80' },
  divider: '#222526',
  status: statusDark,
  connectivity: {
    checking: '#64748B',
    online: '#10B981',
    offline: '#EF4444',
  },
  destructive: '#F87171',
  gpsAura: {
    ring: '#FACC15',
    shadow: '#CA8A04',
  },
  switch: {
    trackOff: '#3D4244',
    trackOn: 'rgba(255, 184, 77, 0.35)',
    thumb: '#E8EAEB',
  },
  filledButtonBg: '#F97316',
  filledButtonFg: '#FFFFFF',
  overlayDark: '#0F172A',
  onOverlayDark: '#FFFFFF',
};

export const colors = lightColors;

export type ColorPalette = typeof lightColors;

/**
 * Mapa plano para CSS no admin — manter alinhado a lightColors / tokens semânticos.
 * Rode: `npm run theme:export-css`
 */
export const webCssVariableMap: Record<string, string> = {
  'color-brand-primary': lightColors.primary,
  'color-brand-accent': lightColors.accent,
  'color-slate': lightColors.slate,
  'color-bg': lightColors.background,
  'color-surface-low': lightColors.surfaceLow,
  'color-surface': lightColors.cardWhite,
  'color-text-secondary': lightColors.textSecondary,
  'color-text-light': lightColors.textLight,
  'color-border': lightColors.border,
  'color-divider': lightColors.divider,
  'color-status-success-fg': lightColors.status.success.fg,
  'color-status-success-bg': lightColors.status.success.bg,
  'color-status-success-border': lightColors.status.success.border,
  'color-status-warning-fg': lightColors.status.warning.fg,
  'color-status-warning-bg': lightColors.status.warning.bg,
  'color-status-warning-border': lightColors.status.warning.border,
  'color-status-danger-fg': lightColors.status.danger.fg,
  'color-status-danger-bg': lightColors.status.danger.bg,
  'color-status-danger-border': lightColors.status.danger.border,
  'color-status-info-fg': lightColors.status.info.fg,
  'color-status-info-bg': lightColors.status.info.bg,
  'color-status-info-border': lightColors.status.info.border,
  'color-connectivity-checking': lightColors.connectivity.checking,
  'color-connectivity-online': lightColors.connectivity.online,
  'color-connectivity-offline': lightColors.connectivity.offline,
  'color-destructive': lightColors.destructive,
  'color-filled-button-bg': lightColors.filledButtonBg,
  'color-filled-button-fg': lightColors.filledButtonFg,
  'color-overlay-dark': lightColors.overlayDark,
  'color-on-overlay-dark': lightColors.onOverlayDark,
  'color-media-before': MEDIA_TAG_COLORS.BEFORE,
  'color-media-during': MEDIA_TAG_COLORS.DURING,
  'color-media-after': MEDIA_TAG_COLORS.AFTER,
  'color-media-damage': MEDIA_TAG_COLORS.DAMAGE,
  'color-media-warranty': MEDIA_TAG_COLORS.WARRANTY,
  'color-media-other': MEDIA_TAG_COLORS.OTHER,
};
