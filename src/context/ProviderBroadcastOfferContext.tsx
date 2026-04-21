import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

export type ProviderBroadcastOfferHandlers = {
  onAccept: (task: any) => Promise<void>;
  onReject: (task: any) => Promise<void>;
};

type Ctx = {
  broadcastOfferTasks: any[];
  setBroadcastOfferTasks: Dispatch<SetStateAction<any[]>>;
  registerBroadcastOfferHandlers: (handlers: ProviderBroadcastOfferHandlers | null) => void;
  invokeAcceptOffer: (task: any) => Promise<void>;
  invokeRejectOffer: (task: any) => Promise<void>;
};

const ProviderBroadcastOfferContext = createContext<Ctx | null>(null);

export function ProviderBroadcastOfferProvider({ children }: { children: React.ReactNode }) {
  const [broadcastOfferTasks, setBroadcastOfferTasks] = useState<any[]>([]);
  const handlersRef = useRef<ProviderBroadcastOfferHandlers | null>(null);

  const registerBroadcastOfferHandlers = useCallback((handlers: ProviderBroadcastOfferHandlers | null) => {
    handlersRef.current = handlers;
  }, []);

  const invokeAcceptOffer = useCallback(async (task: any) => {
    const h = handlersRef.current?.onAccept;
    if (!h) return;
    await h(task);
  }, []);

  const invokeRejectOffer = useCallback(async (task: any) => {
    const h = handlersRef.current?.onReject;
    if (!h) return;
    await h(task);
  }, []);

  const value = useMemo(
    () =>
      ({
        broadcastOfferTasks,
        setBroadcastOfferTasks,
        registerBroadcastOfferHandlers,
        invokeAcceptOffer,
        invokeRejectOffer,
      }) satisfies Ctx,
    [broadcastOfferTasks, registerBroadcastOfferHandlers, invokeAcceptOffer, invokeRejectOffer]
  );

  return (
    <ProviderBroadcastOfferContext.Provider value={value}>{children}</ProviderBroadcastOfferContext.Provider>
  );
}

export function useProviderBroadcastOffer(): Ctx {
  const ctx = useContext(ProviderBroadcastOfferContext);
  if (!ctx) {
    throw new Error('useProviderBroadcastOffer must be used within ProviderBroadcastOfferProvider');
  }
  return ctx;
}
