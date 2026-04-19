import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { canUseProviderMode, type User } from '../services/auth';

export const BRSPARK_PERSONA_STORAGE_KEY = '@brspark_active_persona_v1';

export type MobilePersona = 'client' | 'provider';

type PersonaContextValue = {
  activePersona: MobilePersona;
  setActivePersona: (p: MobilePersona) => Promise<void>;
  /** Só técnicos com capability podem ativar o app como prestador. */
  canUseProviderPersona: boolean;
};

const PersonaContext = createContext<PersonaContextValue | null>(null);

/**
 * A concha (barra, rotas) segue o «MODO DE USO» em Perfil: CLIENTE → (client), PRESTADOR (TECHNICIAN) → (provider).
 */
function deriveActivePersona(user: User | null, userRole: 'CLIENT' | 'TECHNICIAN'): MobilePersona {
  if (!user || !canUseProviderMode(user)) {
    return 'client';
  }
  return userRole === 'TECHNICIAN' ? 'provider' : 'client';
}

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const { user, userRole, setUserRole } = useAuth();

  const canUseProviderPersona = useMemo(() => !!user && canUseProviderMode(user), [user]);

  const activePersona = useMemo((): MobilePersona => {
    if (!user) return 'client';
    return deriveActivePersona(user, userRole);
  }, [user, userRole]);

  const setActivePersona = useCallback(
    async (p: MobilePersona) => {
      if (p === 'provider' && !user) return;
      if (p === 'provider' && !canUseProviderMode(user)) return;
      await setUserRole(p === 'provider' ? 'TECHNICIAN' : 'CLIENT');
    },
    [user, setUserRole]
  );

  const value = useMemo(
    () => ({ activePersona, setActivePersona, canUseProviderPersona }),
    [activePersona, canUseProviderPersona, setActivePersona]
  );

  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona(): PersonaContextValue {
  const ctx = useContext(PersonaContext);
  if (!ctx) {
    throw new Error('usePersona deve ser usado dentro de PersonaProvider');
  }
  return ctx;
}

/**
 * Uso fora de árvore (ex. serviço): prefira evitar. Para telas, use o hook.
 */
export function getPersonaModuleStub(): PersonaContextValue {
  return {
    activePersona: 'client',
    setActivePersona: async () => {},
    canUseProviderPersona: false,
  };
}
