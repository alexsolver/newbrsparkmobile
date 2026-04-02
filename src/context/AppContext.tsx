import React, { createContext, useContext, useRef, useState } from 'react';
import { Alert } from 'react-native';

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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AppMode>('SERVICES');
  const guardRef = useRef<GuardRef>({ isDirty: false, onSave: null, labels: DEFAULT_LABELS });

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
