/** Aviso in-app quando chega push de mensagem do cliente no chat de acompanhamento (sem depender só do poll). */

type Listener = (taskId: string) => void;

const listeners = new Set<Listener>();

export function subscribeTrackingClientChatPing(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function emitTrackingClientChatPing(taskId: string): void {
  const tid = String(taskId || '').trim();
  if (!tid) return;
  for (const l of listeners) {
    try {
      l(tid);
    } catch {
      /* ignore */
    }
  }
}
