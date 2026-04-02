export const lightColors = {
  primary: '#F97316',           // Vibrant Orange (Branding)
  accent: '#EA580C',            // The Spark (Darker Orange)
  branding: '#F97316',          // Branding fallback
  slate: '#0F172A',             // Slate Blue (On Surface)
  background: '#F8F9FA',        // Surface
  surfaceLow: '#F3F4F5',        // Surface Container Low
  cardWhite: '#FFFFFF',         // Surface Container Lowest
  textSecondary: '#475569',     // Medium Slate
  textLight: '#94A3B8',         // Light Slate
  border: '#E2E8F0',            // Divider fallback
  success: { background: '#D1FAE5', text: '#059669' }, 
  warning: { background: '#FFEDD5', text: '#EA580C' }, 
  divider: '#F1F5F9',
};

export const darkColors = {
  primary: '#F8F9FA',
  accent: '#FFB84D',
  branding: '#FFB84D',
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
};

// Default export for backward compatibility — all existing `import { colors }` keeps working.
// At runtime this will be swapped by ThemeProvider via the context, but static references
// use the light palette as the default.
export const colors = lightColors;

export type ColorPalette = typeof lightColors;
