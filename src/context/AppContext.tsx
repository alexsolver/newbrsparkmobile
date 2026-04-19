import React, { createContext, useContext, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { User } from '../services/auth';

export type AppMode = 'SERVICES' | 'ASSETS' | 'PROVIDER';

const DEFAULT_LABELS = {
  title: 'Alterações não salvas',
  msg: 'Você tem alterações não salvas.',
  keep: 'Continuar editando',
  discard: 'Descartar',
  save: 'Salvar e sair',
};

export interface GuardRef {
  isDirty: boolean;
  onSave: (() => void) | null;
  labels: typeof DEFAULT_LABELS;
}

interface AppCtx {
  mode: AppMode;
  setMode: (m: AppMode) => void;
  /** Mutable ref — write only, no re-renders. Read via guardRef.current */
  guardRef: React.MutableRefObject<GuardRef>;
}

const AppContext = createContext<AppCtx>({
  mode: 'SERVICES',
  setMode: () => {},
  guardRef: { current: { isDirty: false, onSave: null, labels: DEFAULT_LABELS } },
});

import { useAuth } from '../hooks/useAuth';
import { usePersona } from './PersonaContext';
import { canUseProviderMode } from '../services/auth';

function useShouldForceProviderMode(
  _userRole: 'CLIENT' | 'TECHNICIAN',
  user: User | null | undefined,
  activePersona: 'client' | 'provider'
): boolean {
  return activePersona === 'provider' && canUseProviderMode(user);
}

function resolveDefaultMode(
  userRole: 'CLIENT' | 'TECHNICIAN',
  user: User | null | undefined,
  activePersona: 'client' | 'provider'
): AppMode {
  if (useShouldForceProviderMode(userRole, user, activePersona)) {
    return 'PROVIDER';
  }
  return 'SERVICES';
}

function normalizeMode(
  nextMode: AppMode,
  userRole: 'CLIENT' | 'TECHNICIAN',
  user: User | null | undefined,
  activePersona: 'client' | 'provider'
): AppMode {
  if (useShouldForceProviderMode(userRole, user, activePersona)) {
    return 'PROVIDER';
  }
  if (activePersona === 'client') {
    return nextMode === 'PROVIDER' ? 'SERVICES' : nextMode;
  }
  return nextMode === 'PROVIDER' ? 'SERVICES' : nextMode;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { userRole, user } = useAuth();
  const { activePersona } = usePersona();
  const [modeState, setModeState] = useState<AppMode>(() => resolveDefaultMode(userRole, user, activePersona));
  const guardRef = useRef<GuardRef>({ isDirty: false, onSave: null, labels: DEFAULT_LABELS });
  const mode = normalizeMode(modeState, userRole, user, activePersona);
  const setMode = React.useCallback(
    (nextMode: AppMode) => {
      setModeState(normalizeMode(nextMode, userRole, user, activePersona));
    },
    [userRole, user, activePersona]
  );

  React.useEffect(() => {
    const next = resolveDefaultMode(userRole, user, activePersona);
    setModeState((prev) => {
      const normalizedPrev = normalizeMode(prev, userRole, user, activePersona);
      return normalizedPrev === next ? prev : next;
    });
  }, [userRole, user, activePersona]);

  return (
    <AppContext.Provider value={{ mode, setMode, guardRef }}>
      {children}
    </AppContext.Provider>
  );
}

export const useAppContext = () => useContext(AppContext);

/**
 * Call this before any back navigation. If guardRef.current.isDirty, shows
 * the unsaved-changes alert. Otherwise calls onProceed immediately.
 */
export function checkGuardBeforeBack(
  guardRef: React.MutableRefObject<GuardRef>,
  onProceed: () => void
) {
  const g = guardRef.current;
  if (!g.isDirty) { onProceed(); return; }
  Alert.alert(g.labels.title, g.labels.msg, [
    { text: g.labels.keep, style: 'cancel' },
    {
      text: g.labels.discard,
      style: 'destructive',
      onPress: () => { g.isDirty = false; onProceed(); },
    },
    {
      text: g.labels.save,
      onPress: () => { g.onSave?.(); },
    },
  ]);
}
