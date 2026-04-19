import type { MobilePersona } from '../context/PersonaContext';

export const CLIENT_TABS_BASE = '/(client)/(tabs)' as const;
export const PROVIDER_TABS_BASE = '/(provider)/(tabs)' as const;

export function getPersonaHomeHref(persona: MobilePersona): string {
  return persona === 'provider' ? PROVIDER_TABS_BASE : CLIENT_TABS_BASE;
}

/**
 * Sufixo de rota (ex. `agenda`, `chat`, `notifications`) sem barra.
 */
export function getPersonaTabHref(persona: MobilePersona, name: string): string {
  const n = name.replace(/^\//, '');
  if (!n || n === 'index' || n === 'home') {
    return getPersonaHomeHref(persona);
  }
  return `${getPersonaHomeHref(persona)}/${n}` as any;
}
