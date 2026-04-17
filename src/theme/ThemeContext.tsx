import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, ColorPalette } from './colors';
import { useAuth } from '../hooks/useAuth';
import { API_BASE } from '../services/auth';

type TenantBranding = {
  enabled?: boolean;
  appDisplayName?: string;
  tagline?: string;
  primaryColor?: string;
  accentColor?: string;
  secondaryColor?: string;
  surfaceColor?: string;
  logoLightUrl?: string;
  logoDarkUrl?: string;
  loginBackgroundUrl?: string;
  brandingVersion?: number;
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = String(hex || '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function channelToLinear(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function getContrastText(hex: string, dark = '#0F172A', light = '#FFFFFF'): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return light;
  const lum =
    0.2126 * channelToLinear(rgb.r) +
    0.7152 * channelToLinear(rgb.g) +
    0.0722 * channelToLinear(rgb.b);
  return lum > 0.55 ? dark : light;
}

interface ThemeCtx {
  dark: boolean;
  colors: ColorPalette;
  toggleDarkMode: (val: boolean) => Promise<void>;
  branding: TenantBranding | null;
  appDisplayName: string;
  appTagline: string;
  resolvedLogoUrl: string | null;
  loginBackgroundUrl: string | null;
}

const ThemeContext = createContext<ThemeCtx>({
  dark: false,
  colors: lightColors,
  toggleDarkMode: async () => {},
  branding: null,
  appDisplayName: 'BrSpark',
  appTagline: 'Precisou, resolveu.',
  resolvedLogoUrl: null,
  loginBackgroundUrl: null,
});

function resolveTenantPalette(base: ColorPalette, branding: TenantBranding | null): ColorPalette {
  if (!branding?.enabled) return base;
  const next = { ...base };
  if (branding.primaryColor) next.primary = branding.primaryColor;
  if (branding.accentColor) next.accent = branding.accentColor;
  if (branding.primaryColor) next.branding = branding.primaryColor;
  if (branding.secondaryColor) next.textSecondary = branding.secondaryColor;
  if (branding.surfaceColor) {
    next.background = branding.surfaceColor;
    next.surfaceLow = branding.surfaceColor;
  }
  if (branding.primaryColor) {
    next.filledButtonBg = branding.primaryColor;
    next.filledButtonFg = getContrastText(branding.primaryColor);
  } else if (branding.accentColor) {
    next.filledButtonBg = branding.accentColor;
    next.filledButtonFg = getContrastText(branding.accentColor);
  }
  return next;
}

function resolveBrandingUrl(url: string | null | undefined): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${API_BASE}${raw}`;
  return null;
}

function ThemeProviderInner({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    AsyncStorage.getItem('@pref_dark_mode')
      .then((v) => {
        if (v) setDark(JSON.parse(v));
      })
      .catch(() => {});
  }, []);

  const toggleDarkMode = async (val: boolean) => {
    setDark(val);
    await AsyncStorage.setItem('@pref_dark_mode', JSON.stringify(val));
  };

  const branding = user?.tenant?.branding?.enabled ? user.tenant.branding : null;
  const palette = useMemo(
    () => resolveTenantPalette(dark ? darkColors : lightColors, branding || null),
    [dark, branding],
  );
  const appDisplayName =
    (branding?.enabled && String(branding.appDisplayName || '').trim()) || 'BrSpark';
  const appTagline =
    (branding?.enabled && String(branding.tagline || '').trim()) || 'Precisou, resolveu.';
  const resolvedLogoUrl =
    branding?.enabled && (dark ? branding.logoDarkUrl || branding.logoLightUrl : branding.logoLightUrl || branding.logoDarkUrl)
      ? dark
        ? resolveBrandingUrl(branding.logoDarkUrl || branding.logoLightUrl || null)
        : resolveBrandingUrl(branding.logoLightUrl || branding.logoDarkUrl || null)
      : null;
  const loginBackgroundUrl =
    branding?.enabled && branding.loginBackgroundUrl ? resolveBrandingUrl(branding.loginBackgroundUrl) : null;

  return (
    <ThemeContext.Provider
      value={{
        dark,
        colors: palette,
        toggleDarkMode,
        branding,
        appDisplayName,
        appTagline,
        resolvedLogoUrl,
        loginBackgroundUrl,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeProviderInner>{children}</ThemeProviderInner>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
