import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ptBR from './locales/pt-BR.json';
import enUS from './locales/en-US.json';
import esES from './locales/es-ES.json';
import deDE from './locales/de-DE.json';

const LANG_KEY = '@brspark_language';

const SUPPORTED = ['pt-BR', 'en-US', 'es-ES', 'de-DE'] as const;
type SupportedLang = typeof SUPPORTED[number];

// Maps device locale tag → supported i18n language
function getDeviceLanguage(): SupportedLang {
  try {
    const locales = getLocales();
    if (locales.length > 0) {
      const tag = locales[0].languageTag; // e.g. 'pt-BR', 'en-US', 'es-MX', 'es-AR'
      if (tag.startsWith('pt')) return 'pt-BR';
      if (tag.startsWith('es')) return 'es-ES'; // covers es-AR, es-MX, es-ES, etc.
      if (tag.startsWith('de')) return 'de-DE';
      if (tag.startsWith('en')) return 'en-US';
    }
  } catch {}
  return 'pt-BR';
}

const REGISTER_REGION_CODES = ['BR', 'US', 'ES', 'AR', 'DE'] as const;
export type RegisterRegionCode = (typeof REGISTER_REGION_CODES)[number];

/**
 * País pré-selecionado no cadastro a partir da região/idioma do sistema (Ajustes do celular).
 * Não usa GPS — só expo-localization (mercado costuma tratar isto como “localização” do utilizador).
 */
export function getDeviceRegion(): RegisterRegionCode {
  try {
    const locales = getLocales();
    if (locales.length > 0) {
      const region = String(locales[0].regionCode || '').toUpperCase();
      if (REGISTER_REGION_CODES.includes(region as RegisterRegionCode)) {
        return region as RegisterRegionCode;
      }

      const tag = String(locales[0].languageTag || '')
        .replace('_', '-')
        .toLowerCase();

      // Argentina: tag ou código ISO explícito
      if (tag === 'es-ar' || region === 'AR') return 'AR';

      // Português (Brasil, Portugal, etc.) → única opção lusófona na lista
      if (tag.startsWith('pt')) return 'BR';

      // Inglês → EUA como opção EN na lista
      if (tag.startsWith('en')) return 'US';

      // Espanhol genérico / América Latina sem opção própria → Espanha como locale es-ES
      if (tag.startsWith('es')) return 'ES';

      if (tag.startsWith('de') || region === 'DE' || region === 'AT' || region === 'CH') return 'DE';
    }
  } catch {}
  return 'BR';
}

// Init i18next
i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
    'en-US': { translation: enUS },
    'es-ES': { translation: esES },
    'de-DE': { translation: deDE },
  },
  lng: getDeviceLanguage(),
  fallbackLng: 'en-US',
  debug: false,
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

// Load saved language preference
AsyncStorage.getItem(LANG_KEY)
  .then((saved) => {
    if (saved && (SUPPORTED as readonly string[]).includes(saved)) {
      void i18n.changeLanguage(saved);
    }
  })
  .catch(() => {});

// Helper to change and persist language
export async function setLanguage(lang: SupportedLang) {
  await i18n.changeLanguage(lang);
  await AsyncStorage.setItem(LANG_KEY, lang);
}

export function getCurrentLanguage(): string {
  return i18n.language || 'pt-BR';
}

export default i18n;
