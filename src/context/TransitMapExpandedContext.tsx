import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type Ctx = {
  /** Mapa de deslocamento (LiveRouteMapCard) em ecrã inteiro — folha de oferta broadcast deve aninhar-se aqui no Android. */
  transitMapExpanded: boolean;
  setTransitMapExpanded: (v: boolean) => void;
};

const TransitMapExpandedContext = createContext<Ctx | null>(null);

export function TransitMapExpandedProvider({ children }: { children: React.ReactNode }) {
  const [transitMapExpanded, setTransitMapExpandedState] = useState(false);
  const setTransitMapExpanded = useCallback((v: boolean) => {
    setTransitMapExpandedState(v);
  }, []);
  const value = useMemo(
    () => ({ transitMapExpanded, setTransitMapExpanded }),
    [transitMapExpanded, setTransitMapExpanded]
  );
  return (
    <TransitMapExpandedContext.Provider value={value}>{children}</TransitMapExpandedContext.Provider>
  );
}

export function useTransitMapExpanded(): Ctx {
  const ctx = useContext(TransitMapExpandedContext);
  if (!ctx) {
    throw new Error('useTransitMapExpanded requires TransitMapExpandedProvider');
  }
  return ctx;
}
