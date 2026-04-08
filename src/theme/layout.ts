/** Escala compartilhada — usar em novos componentes e migrações graduais. */
export const space = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
} as const;

export const fontWeight = {
  medium: '500' as const,
  bold: '700' as const,
  black: '900' as const,
};

export const hitSlop = { minHeight: 44, minWidth: 44 } as const;
