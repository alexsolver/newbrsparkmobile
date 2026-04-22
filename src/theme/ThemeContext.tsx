import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { lightColors, darkColors, ColorPalette } from './colors';
import { useAuth } from '../hooks/useAuth';
import { API_BASE } from '../services/auth';

const BRANDING_CACHE_KEY = '@brspark:tenant_branding_cache';
const BRANDING_LOGO_CACHE_KEY = '@brspark:tenant_branding_logo_cache';

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

type BrandingLogoCache = {
  lightRemoteUrl: string | null;
  darkRemoteUrl: string | null;
  lightLocalUri: string | null;
  darkLocalUri: string | null;
  updatedAt: number;
};

function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

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
  const [brandingCache, setBrandingCache] = useState<TenantBranding | null>(null);
  const [logoCache, setLogoCache] = useState<BrandingLogoCache | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    AsyncStorage.getItem('@pref_dark_mode')
      .then((v) => {
        if (v) setDark(JSON.parse(v));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(BRANDING_CACHE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          setBrandingCache(JSON.parse(raw));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(BRANDING_LOGO_CACHE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as BrandingLogoCache;
          if (parsed && typeof parsed === 'object') setLogoCache(parsed);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, []);

  const toggleDarkMode = async (val: boolean) => {
    setDark(val);
    await AsyncStorage.setItem('@pref_dark_mode', JSON.stringify(val));
  };

  /** Cores / logótipo / fundo: só com white-label ligado no plano + tenant. */
  const liveBranding = user?.tenant?.branding?.enabled ? user.tenant.branding : null;
  /** Nome e slogan: o backend preenche `effective` mesmo com `enabled: false` (ex.: nome da org). */
  const serverTenantBranding = user?.tenant?.branding;
  const branding =
    liveBranding && Number(liveBranding.brandingVersion || 0) >= Number(brandingCache?.brandingVersion || 0)
      ? liveBranding
      : brandingCache?.enabled
        ? brandingCache
        : liveBranding;

  useEffect(() => {
    const tb = user?.tenant?.branding;
    /** Só limpar cache quando o servidor diz explicitamente que o branding está desligado.
     *  Nunca apagar só porque `branding` veio ausente na resposta (rede parcial / /me sem aninhar tenant). */
    if (tb && tb.enabled === false) {
      setBrandingCache(null);
      AsyncStorage.removeItem(BRANDING_CACHE_KEY).catch(() => {});
      return;
    }
    if (!liveBranding?.enabled) return;
    const nextRaw = JSON.stringify(liveBranding);
    const prevRaw = JSON.stringify(brandingCache || null);
    if (nextRaw === prevRaw) return;
    setBrandingCache(liveBranding);
    AsyncStorage.setItem(BRANDING_CACHE_KEY, nextRaw).catch(() => {});
  }, [liveBranding, brandingCache, user?.tenant?.branding]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!liveBranding?.enabled) return;
      const lightRemote = resolveBrandingUrl(liveBranding.logoLightUrl || liveBranding.logoDarkUrl || null);
      const darkRemote = resolveBrandingUrl(liveBranding.logoDarkUrl || liveBranding.logoLightUrl || null);
      if (!lightRemote && !darkRemote) return;

      const current = logoCache || {
        lightRemoteUrl: null,
        darkRemoteUrl: null,
        lightLocalUri: null,
        darkLocalUri: null,
        updatedAt: 0,
      };
      let next: BrandingLogoCache = { ...current };

      const ensureLogoCached = async (
        remoteUrl: string | null,
        variant: 'light' | 'dark',
      ): Promise<string | null> => {
        if (!remoteUrl) return null;
        const currRemote = variant === 'light' ? current.lightRemoteUrl : current.darkRemoteUrl;
        const currLocal = variant === 'light' ? current.lightLocalUri : current.darkLocalUri;
        if (currRemote === remoteUrl && currLocal) {
          try {
            const info = await FileSystem.getInfoAsync(currLocal);
            if (info.exists) return currLocal;
          } catch {
            /* ignore */
          }
        }
        try {
          const baseDir = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}branding-cache/`;
          await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
          const file = `${baseDir}logo_${variant}_${hashString(remoteUrl)}.png`;
          await FileSystem.downloadAsync(remoteUrl, file);
          return file;
        } catch {
          return currLocal || null;
        }
      };

      const [lightLocal, darkLocal] = await Promise.all([
        ensureLogoCached(lightRemote, 'light'),
        ensureLogoCached(darkRemote, 'dark'),
      ]);

      next = {
        lightRemoteUrl: lightRemote || null,
        darkRemoteUrl: darkRemote || null,
        lightLocalUri: lightLocal || null,
        darkLocalUri: darkLocal || null,
        updatedAt: Date.now(),
      };

      if (cancelled) return;
      setLogoCache(next);
      await AsyncStorage.setItem(BRANDING_LOGO_CACHE_KEY, JSON.stringify(next)).catch(() => {});
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [liveBranding, logoCache]);

  const palette = useMemo(
    () => resolveTenantPalette(dark ? darkColors : lightColors, branding || null),
    [dark, branding],
  );
  const appDisplayName = user
    ? String(serverTenantBranding?.appDisplayName || user.tenant?.name || '').trim() || 'BrSpark'
    : (branding?.enabled && String(branding.appDisplayName || '').trim()) || 'BrSpark';
  const appTagline = user
    ? String(serverTenantBranding?.tagline || '').trim() || 'Precisou, resolveu.'
    : (branding?.enabled && String(branding.tagline || '').trim()) || 'Precisou, resolveu.';
  const resolvedLogoUrl =
    branding?.enabled
      ? dark
        ? logoCache?.darkLocalUri || logoCache?.lightLocalUri || null
        : logoCache?.lightLocalUri || logoCache?.darkLocalUri || null
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
