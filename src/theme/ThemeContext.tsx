import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { lightColors, darkColors, ColorPalette } from './colors';
import { useAuth } from '../hooks/useAuth';
import { useAppContext } from '../context/AppContext';
import { GUEST_LOGIN_BRANDING_KEY, canUseProviderMode } from '../services/auth';
import { API_BASE } from '../services/appApiBase';

const BRANDING_CACHE_KEY = '@aria:tenant_branding_cache';
const BRANDING_LOGO_CACHE_KEY = '@aria:tenant_branding_logo_cache';

type TenantBranding = {
  enabled?: boolean;
  appDisplayName?: string;
  tagline?: string;
  primaryColor?: string;
  accentColor?: string;
  secondaryColor?: string;
  surfaceColor?: string;
  menuChipActiveBg?: string;
  menuChipActiveFg?: string;
  menuChipInactiveBg?: string;
  menuChipInactiveFg?: string;
  menuChipInactiveBorder?: string;
  logoLightUrl?: string;
  logoDarkUrl?: string;
  loginPageLogoUrl?: string;
  loginBackgroundColor?: string;
  appHeaderBackgroundColor?: string;
  brandingVersion?: number;
};

type BrandingLogoCache = {
  lightRemoteUrl: string | null;
  darkRemoteUrl: string | null;
  lightLocalUri: string | null;
  darkLocalUri: string | null;
  loginPageRemoteUrl: string | null;
  loginPageLocalUri: string | null;
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

/** Contraste legível sobre `hex` (ex.: ícone sobre `surfaceLow` no botão voltar do header). */
export function getContrastText(hex: string, dark = '#0F172A', light = '#FFFFFF'): string {
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
  /** Hex #RRGGBB quando a marca define fundo de topo do login; `null` = bloco padrão (só logo centrado). */
  loginScreenHeroBackgroundColor: string | null;
  /** Cor do slogan nesse bloco (contraste com `loginScreenHeroBackgroundColor`). */
  loginHeroTaglineColor: string;
  /** URI (cache ou remoto) do logo só no login; `null` = usar `resolvedLogoUrl`. */
  resolvedLoginPageLogoUrl: string | null;
  /** Fundo da barra global no app (fallback = cartão branco do tema). */
  appHeaderBarBackgroundColor: string;
  /** Ícones / texto principal na barra (títulos, sino ativo, seta). */
  appHeaderBarForegroundColor: string;
  /** Estados “muted” na barra (ex.: sino outline). */
  appHeaderBarSecondaryForegroundColor: string;
}

const ThemeContext = createContext<ThemeCtx>({
  dark: false,
  colors: lightColors,
  toggleDarkMode: async () => {},
  branding: null,
  appDisplayName: 'Aria',
  appTagline: '',
  resolvedLogoUrl: null,
  loginScreenHeroBackgroundColor: null,
  loginHeroTaglineColor: lightColors.textSecondary,
  resolvedLoginPageLogoUrl: null,
  appHeaderBarBackgroundColor: lightColors.cardWhite,
  appHeaderBarForegroundColor: lightColors.slate,
  appHeaderBarSecondaryForegroundColor: lightColors.textSecondary,
});

function resolveTenantPalette(base: ColorPalette, branding: TenantBranding | null): ColorPalette {
  if (!branding?.enabled) return base;
  const next = { ...base };
  if (branding.primaryColor) next.primary = branding.primaryColor;
  if (branding.accentColor) next.accent = branding.accentColor;
  /** Só `primaryColor` no painel: evitar `accent` por defeito igual ao primário em chips e ícones. */
  if (branding.primaryColor && !String(branding.accentColor || '').trim()) {
    next.accent = branding.primaryColor;
  }
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

  const chipActiveBg =
    String(branding.menuChipActiveBg || '').trim() ||
    String(branding.accentColor || '').trim() ||
    String(branding.primaryColor || '').trim() ||
    next.accent;
  next.menuChipActiveBg = chipActiveBg;
  const chipFgExplicit = String(branding.menuChipActiveFg || '').trim();
  next.menuChipActiveFg = chipFgExplicit ? chipFgExplicit : getContrastText(chipActiveBg);
  next.menuChipInactiveBg = String(branding.menuChipInactiveBg || '').trim() || next.cardWhite;
  next.menuChipInactiveFg = String(branding.menuChipInactiveFg || '').trim() || next.textSecondary;
  next.menuChipInactiveBorder = String(branding.menuChipInactiveBorder || '').trim() || next.border;

  return next;
}

/**
 * URLs de branding gravadas com o Node local (`http://127.0.0.1:3001/uploads/...`)
 * funcionam no simulador (loopback = Mac) mas falham no telemóvel (loopback = aparelho).
 * Reescreve só loopback → mesma origem que `API_BASE` (ex.: produção).
 */
/** Origem pública do CMS Laravel (EAS: `EXPO_PUBLIC_ARIA_CMS_PUBLIC_URL`) — `/storage/*` não vive na API Node. */
function cmsPublicOrigin(): string {
  try {
    const v =
      typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_ARIA_CMS_PUBLIC_URL
        ? String(process.env.EXPO_PUBLIC_ARIA_CMS_PUBLIC_URL).trim()
        : '';
    return v.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/** App Store: ATS bloqueia `http://` para assets remotos; manter http em loopback/LAN para dev. */
function forceHttpsOnPublicAssetUrl(u: string | null): string | null {
  const s = String(u || '').trim();
  if (!s) return u;
  if (!/^http:\/\//i.test(s)) return s;
  try {
    const host = new URL(s).hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return s;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return s;
    const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
    if (m) {
      const sec = Number(m[1]);
      if (sec >= 16 && sec <= 31) return s;
    }
    return `https://${s.slice('http://'.length)}`;
  } catch {
    return s;
  }
}

function rewriteLoopbackBrandingAssetUrl(absoluteUrl: string): string {
  const s = String(absoluteUrl || '').trim();
  if (!s) return s;
  try {
    const u = new URL(/^\/\//i.test(s) ? `https:${s}` : s);
    const h = u.hostname.toLowerCase();
    if (h !== '127.0.0.1' && h !== 'localhost' && h !== '::1') return s;
    const path = `${u.pathname || ''}${u.search || ''}`;
    const api = API_BASE.replace(/\/+$/, '');
    return `${api}${path.startsWith('/') ? path : `/${path}`}`;
  } catch {
    return s;
  }
}

function resolveBrandingUrl(url: string | null | undefined): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  let out: string | null = null;
  if (/^https?:\/\//i.test(raw)) {
    out = rewriteLoopbackBrandingAssetUrl(raw);
  } else if (raw.startsWith('/storage/')) {
    const cms = cmsPublicOrigin();
    out = cms ? `${cms}${raw}` : `${API_BASE.replace(/\/+$/, '')}${raw}`;
  } else if (raw.startsWith('/')) {
    out = `${API_BASE.replace(/\/+$/, '')}${raw}`;
  }
  return forceHttpsOnPublicAssetUrl(out);
}

function ThemeProviderInner({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);
  const [brandingCache, setBrandingCache] = useState<TenantBranding | null>(null);
  const [logoCache, setLogoCache] = useState<BrandingLogoCache | null>(null);
  const { user, loading: authLoading } = useAuth();
  const { mode } = useAppContext();
  /** Marca da empresa (tenant da sessão) só no modo operacional prestador; SERVICES/ASSETS = experiência cliente. */
  const providerWorkMode =
    !!user && canUseProviderMode(user) && mode === 'PROVIDER';
  const clientExperienceUi = !providerWorkMode;

  useEffect(() => {
    AsyncStorage.getItem('@pref_dark_mode')
      .then((v) => {
        if (v) setDark(JSON.parse(v));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let raw = await AsyncStorage.getItem(BRANDING_CACHE_KEY);
        if (!raw) raw = await AsyncStorage.getItem(GUEST_LOGIN_BRANDING_KEY);
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as TenantBranding;
        if (parsed?.enabled) setBrandingCache(parsed);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Após logout (ou sessão expirada), alinhar estado ao que ficou em disco — purge apaga `BRANDING_CACHE_KEY` e grava só o guest. */
  useEffect(() => {
    if (authLoading) return;
    if (user != null) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(BRANDING_CACHE_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as TenantBranding;
            if (!cancelled) setBrandingCache(parsed?.enabled ? parsed : null);
          } catch {
            if (!cancelled) setBrandingCache(null);
          }
          return;
        }
        const rawG = await AsyncStorage.getItem(GUEST_LOGIN_BRANDING_KEY);
        if (!rawG) {
          if (!cancelled) setBrandingCache(null);
          return;
        }
        try {
          const parsed = JSON.parse(rawG) as TenantBranding;
          if (!cancelled) setBrandingCache(parsed?.enabled ? parsed : null);
        } catch {
          if (!cancelled) setBrandingCache(null);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  useEffect(() => {
    AsyncStorage.getItem(BRANDING_LOGO_CACHE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as Partial<BrandingLogoCache>;
          if (parsed && typeof parsed === 'object') {
            setLogoCache({
              lightRemoteUrl: parsed.lightRemoteUrl ?? null,
              darkRemoteUrl: parsed.darkRemoteUrl ?? null,
              lightLocalUri: parsed.lightLocalUri ?? null,
              darkLocalUri: parsed.darkLocalUri ?? null,
              loginPageRemoteUrl: parsed.loginPageRemoteUrl ?? null,
              loginPageLocalUri: parsed.loginPageLocalUri ?? null,
              updatedAt: parsed.updatedAt ?? 0,
            });
          }
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

  /**
   * Persona «cliente» com registo (piscina) ≠ tenant da sessão (empresa dedicada): nunca misturar com cache da empresa.
   */
  const dedicatedHomeMismatch =
    !!user?.homeTenantId &&
    !!user?.tenantId &&
    String(user.homeTenantId) !== String(user.tenantId);

  /** Backend mascara a piscina como nome «Aria» — aí o `tenant.branding` já é o da app. */
  const poolMaskedTenantName = String(user?.tenant?.name || '').trim() === 'Aria';

  /**
   * UI «cliente» sobre tenant que não é a piscina mascarada (ex.: empresa): não usar white-label operacional.
   * Inclui consumidor na empresa e técnico em modo SERVIÇOS/ATIVOS (não PROVIDER).
   */
  const enterpriseClientUi = clientExperienceUi && !poolMaskedTenantName;

  const useClientSurfaceBranding =
    clientExperienceUi &&
    (user?.clientTenantBranding != null || dedicatedHomeMismatch || enterpriseClientUi);

  /** Cores / logótipo / fundo: só com white-label ligado no plano + tenant. */
  const liveBranding = (() => {
    if (providerWorkMode) {
      return user?.tenant?.branding?.enabled ? user.tenant.branding : null;
    }
    if (user?.clientTenantBranding?.enabled) return user.clientTenantBranding;
    if (poolMaskedTenantName) {
      return user?.tenant?.branding?.enabled ? user.tenant.branding : null;
    }
    return null;
  })();

  /** Nome: o backend preenche `effective` mesmo com `enabled: false` (ex.: nome da org). Slogan só com marca ativa. */
  const serverTenantBranding =
    clientExperienceUi && poolMaskedTenantName
      ? user?.tenant?.branding
      : clientExperienceUi
        ? user?.clientTenantBranding
        : user?.tenant?.branding;

  /**
   * Superfície cliente: não comparar com `brandingCache` da empresa (versões mais altas roubavam a marca da piscina).
   */
  const branding = useClientSurfaceBranding
    ? liveBranding || null
    : liveBranding && Number(liveBranding.brandingVersion || 0) >= Number(brandingCache?.brandingVersion || 0)
      ? liveBranding
      : brandingCache?.enabled
        ? brandingCache
        : liveBranding;

  useEffect(() => {
    if (useClientSurfaceBranding) {
      const tb = user?.clientTenantBranding;
      if (tb && tb.enabled === false) {
        setBrandingCache(null);
        AsyncStorage.multiRemove([BRANDING_CACHE_KEY, GUEST_LOGIN_BRANDING_KEY]).catch(() => {});
        return;
      }
      if (liveBranding?.enabled) {
        const nextRaw = JSON.stringify(liveBranding);
        const prevRaw = JSON.stringify(brandingCache || null);
        if (nextRaw !== prevRaw) {
          setBrandingCache(liveBranding);
          AsyncStorage.setItem(BRANDING_CACHE_KEY, nextRaw).catch(() => {});
        }
        return;
      }
      setBrandingCache(null);
      AsyncStorage.removeItem(BRANDING_CACHE_KEY).catch(() => {});
      return;
    }

    const tb = user?.tenant?.branding;
    /** Só limpar cache quando o servidor diz explicitamente que o branding está desligado.
     *  Nunca apagar só porque `branding` veio ausente na resposta (rede parcial / /me sem aninhar tenant). */
    if (tb && tb.enabled === false) {
      setBrandingCache(null);
      AsyncStorage.multiRemove([BRANDING_CACHE_KEY, GUEST_LOGIN_BRANDING_KEY]).catch(() => {});
      return;
    }
    if (!liveBranding?.enabled) return;
    const nextRaw = JSON.stringify(liveBranding);
    const prevRaw = JSON.stringify(brandingCache || null);
    if (nextRaw === prevRaw) return;
    setBrandingCache(liveBranding);
    AsyncStorage.setItem(BRANDING_CACHE_KEY, nextRaw).catch(() => {});
  }, [liveBranding, brandingCache, user?.tenant?.branding, user?.clientTenantBranding, useClientSurfaceBranding]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!branding?.enabled) return;
      const lightRemote = resolveBrandingUrl(branding.logoLightUrl || branding.logoDarkUrl || null);
      const darkRemote = resolveBrandingUrl(branding.logoDarkUrl || branding.logoLightUrl || null);
      const loginPageRemote = resolveBrandingUrl(branding.loginPageLogoUrl || null);

      if (!lightRemote && !darkRemote && !loginPageRemote) return;

      const current = logoCache || {
        lightRemoteUrl: null,
        darkRemoteUrl: null,
        lightLocalUri: null,
        darkLocalUri: null,
        loginPageRemoteUrl: null,
        loginPageLocalUri: null,
        updatedAt: 0,
      };

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

      const ensureLoginPageCached = async (remoteUrl: string | null): Promise<string | null> => {
        if (!remoteUrl) return null;
        const currRemote = current.loginPageRemoteUrl;
        const currLocal = current.loginPageLocalUri;
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
          const file = `${baseDir}login_page_${hashString(remoteUrl)}.png`;
          await FileSystem.downloadAsync(remoteUrl, file);
          return file;
        } catch {
          return currLocal || null;
        }
      };

      const [lightLocal, darkLocal, loginPageLocal] = await Promise.all([
        ensureLogoCached(lightRemote, 'light'),
        ensureLogoCached(darkRemote, 'dark'),
        ensureLoginPageCached(loginPageRemote),
      ]);

      const next: BrandingLogoCache = {
        lightRemoteUrl: lightRemote || null,
        darkRemoteUrl: darkRemote || null,
        lightLocalUri: lightLocal || null,
        darkLocalUri: darkLocal || null,
        loginPageRemoteUrl: loginPageRemote || null,
        loginPageLocalUri: loginPageLocal || null,
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
  }, [branding, logoCache]);

  const palette = useMemo(
    () => resolveTenantPalette(dark ? darkColors : lightColors, branding || null),
    [dark, branding],
  );
  const appDisplayName =
    user && enterpriseClientUi
      ? String(user?.clientTenantBranding?.appDisplayName || '').trim() || 'Aria'
      : user
        ? String(
            serverTenantBranding?.appDisplayName ||
              user.tenant?.ownerName ||
              user.tenant?.name ||
              '',
          ).trim() || 'Aria'
        : (branding?.enabled && String(branding.appDisplayName || '').trim()) || 'Aria';
  /** Slogan só com white-label ativo; vazio no painel/CMS não mostra (evita mirror CMS + payload legado). */
  const appTagline =
    user && enterpriseClientUi
      ? user?.clientTenantBranding?.enabled
        ? String(user.clientTenantBranding?.tagline || '').trim()
        : ''
      : user
        ? serverTenantBranding?.enabled
          ? String(serverTenantBranding?.tagline || '').trim()
          : ''
        : branding?.enabled
          ? String(branding.tagline || '').trim()
          : '';

  /** Remoto resolvido (mesma lógica que o efeito de cache) — fallback quando `downloadAsync` falha no aparelho. */
  const brandingLogoRemoteLight = useMemo(() => {
    if (!branding?.enabled) return null;
    return resolveBrandingUrl(branding.logoLightUrl || branding.logoDarkUrl || null);
  }, [branding?.enabled, branding?.logoLightUrl, branding?.logoDarkUrl]);

  const brandingLogoRemoteDark = useMemo(() => {
    if (!branding?.enabled) return null;
    return resolveBrandingUrl(branding.logoDarkUrl || branding.logoLightUrl || null);
  }, [branding?.enabled, branding?.logoLightUrl, branding?.logoDarkUrl]);

  const brandingLoginPageRemote = useMemo(() => {
    if (!branding?.enabled) return null;
    return resolveBrandingUrl(branding.loginPageLogoUrl || null);
  }, [branding?.enabled, branding?.loginPageLogoUrl]);

  const resolvedLogoUrl =
    branding?.enabled
      ? dark
        ? logoCache?.darkLocalUri ||
          logoCache?.lightLocalUri ||
          brandingLogoRemoteDark ||
          brandingLogoRemoteLight ||
          null
        : logoCache?.lightLocalUri ||
          logoCache?.darkLocalUri ||
          brandingLogoRemoteLight ||
          brandingLogoRemoteDark ||
          null
      : null;

  const resolvedLoginPageLogoUrl = branding?.enabled
    ? logoCache?.loginPageLocalUri || brandingLoginPageRemote || null
    : null;

  const customAppHeaderBg = useMemo(() => {
    if (!branding?.enabled) return null;
    const c = String(branding.appHeaderBackgroundColor || '').trim();
    if (!c || !/^#([0-9A-Fa-f]{6})$/.test(c)) return null;
    return c.toUpperCase();
  }, [branding]);

  const appHeaderBarBackgroundColor = customAppHeaderBg ?? palette.cardWhite;
  const appHeaderBarForegroundColor = useMemo(
    () => (customAppHeaderBg ? getContrastText(customAppHeaderBg) : palette.slate),
    [customAppHeaderBg, palette.slate],
  );
  const appHeaderBarSecondaryForegroundColor = useMemo(() => {
    if (!customAppHeaderBg) return palette.textSecondary;
    const fg = getContrastText(customAppHeaderBg);
    return fg === '#FFFFFF' || fg === '#ffffff' ? 'rgba(255,255,255,0.82)' : 'rgba(15,23,42,0.62)';
  }, [customAppHeaderBg, palette.textSecondary]);

  const loginScreenHeroBackgroundColor = useMemo(() => {
    if (!branding?.enabled) return null;
    const c = String(branding.loginBackgroundColor || '').trim();
    if (!c || !/^#([0-9A-Fa-f]{6})$/.test(c)) return null;
    return c.toUpperCase();
  }, [branding]);

  const loginHeroTaglineColor = useMemo(() => {
    if (!loginScreenHeroBackgroundColor) return palette.textSecondary;
    return getContrastText(loginScreenHeroBackgroundColor);
  }, [loginScreenHeroBackgroundColor, palette.textSecondary]);

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
        resolvedLoginPageLogoUrl,
        loginScreenHeroBackgroundColor,
        loginHeroTaglineColor,
        appHeaderBarBackgroundColor,
        appHeaderBarForegroundColor,
        appHeaderBarSecondaryForegroundColor,
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
