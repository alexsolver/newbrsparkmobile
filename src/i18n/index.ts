import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ptBR from './locales/pt-BR.json';
import enUS from './locales/en-US.json';
import esES from './locales/es-ES.json';

const LANG_KEY = '@brspark_language';

const SUPPORTED = ['pt-BR', 'en-US', 'es-ES'] as const;
type SupportedLang = typeof SUPPORTED[number];

// Maps device locale tag → supported i18n language
function getDeviceLanguage(): SupportedLang {
  try {
    const locales = getLocales();
    if (locales.length > 0) {
      const tag = locales[0].languageTag; // e.g. 'pt-BR', 'en-US', 'es-MX', 'es-AR'
      if (tag.startsWith('pt')) return 'pt-BR';
      if (tag.startsWith('es')) return 'es-ES'; // covers es-AR, es-MX, es-ES, etc.
      if (tag.startsWith('en')) return 'en-US';
    }
  } catch {}
  return 'pt-BR';
}

// Returns detected country code (BR / US / ES / AR) for region pre-selection
export function getDeviceRegion(): string {
  try {
    const locales = getLocales();
    if (locales.length > 0) {
      const region = locales[0].regionCode || '';
      const allowed = ['BR', 'US', 'ES', 'AR'];
      if (allowed.includes(region)) return region;
      // Fallback mapping by language
      const tag = locales[0].languageTag;
      if (tag.startsWith('pt')) return 'BR';
      if (tag === 'es-AR') return 'AR';
      if (tag.startsWith('es')) return 'ES';
      if (tag.startsWith('en')) return 'US';
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
  },
  lng: getDeviceLanguage(),
  fallbackLng: 'en-US',
  debug: false,
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

// Load saved language preference
AsyncStorage.getItem(LANG_KEY).then(saved => {
  if (saved && (SUPPORTED as readonly string[]).includes(saved)) {
    i18n.changeLanguage(saved);
  }
});

// Helper to change and persist language
export async function setLanguage(lang: SupportedLang) {
  await i18n.changeLanguage(lang);
  await AsyncStorage.setItem(LANG_KEY, lang);
}

export function getCurrentLanguage(): string {
  return i18n.language || 'pt-BR';
}

export default i18n;
