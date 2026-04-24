import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './auth';
import type { ChatMessage } from './chat';
import { emitChatUnreadChanged } from '../lib/chatUnreadEvents';
import { getOpsChatAckStorageKey } from '../lib/opsChatAckLocal';

/** Re-export para módulos que importam a partir de `executionOpsChat`. */
export { getOpsChatAckStorageKey };

/** ID virtual da “sala” no cache local — evita colisão com IDs de salas do chat corporativo. */
export function getOpsChatCacheRoomId(executionId: string): string {
  return `ops:${String(executionId || '').trim()}`;
}

export function mapExecutionOpsMessagesToChat(
  executionId: string,
  rows: ExecutionOpsChatMessage[],
  currentUserEmail: string,
): ChatMessage[] {
  const roomId = getOpsChatCacheRoomId(executionId);
  const em = String(currentUserEmail || '').trim().toLowerCase();
  return rows.map((m) => {
    const sk = String(m.senderKind || '').toUpperCase();
    const senderEmailNorm = String(m.senderEmail || '').trim().toLowerCase();
    const senderName =
      sk === 'GESTOR' ? 'Gestor' : sk === 'TECH' && senderEmailNorm === em ? 'Você' : 'Técnico';
    const display =
      m.displayBody != null && String(m.displayBody).trim() !== '' ? String(m.displayBody) : undefined;
    return {
      id: m.id,
      roomId,
      senderId: String(m.senderEmail || ''),
      senderName,
      type: 'text' as const,
      content: m.body,
      displayContent: display,
      timestamp: new Date(m.createdAt).getTime(),
      pending: false,
    };
  });
}

export async function persistOpsChatReadAck(executionId: string, rows: ExecutionOpsChatMessage[]): Promise<void> {
  try {
    /** Com `rows` vazio, `maxMs` ficava 0 e sobrescrevia o ack — o badge OS/gestor voltava a marcar tudo como não lido. */
    if (!rows.length) return;

    let maxMs = 0;
    for (const m of rows) {
      const t = new Date(m.createdAt).getTime();
      if (Number.isFinite(t) && t > maxMs) maxMs = t;
    }
    const key = getOpsChatAckStorageKey(executionId);
    const prevRaw = await AsyncStorage.getItem(key);
    const prevMs = prevRaw != null && String(prevRaw).trim() !== '' ? Number(prevRaw) : 0;
    const prevOk = Number.isFinite(prevMs) && prevMs > 0 ? prevMs : 0;
    const nextMs = Math.max(maxMs, prevOk);
    await AsyncStorage.setItem(key, String(nextMs));
    emitChatUnreadChanged();
  } catch {
    /* ignore */
  }
}

export type ExecutionOpsChatMessage = {
  id: string;
  senderEmail: string;
  senderKind: string;
  body: string;
  /** Texto para o idioma do utilizador (servidor); ausente = usar `body`. */
  displayBody?: string | null;
  createdAt: string;
};

function opsChatViewerLocaleQuery(viewerLocale?: string | null): string {
  if (viewerLocale == null || String(viewerLocale).trim() === '') return '';
  return `?viewerLocale=${encodeURIComponent(String(viewerLocale).trim())}`;
}

export async function fetchExecutionOpsChat(
  executionId: string,
  viewerLocale?: string | null,
): Promise<ExecutionOpsChatMessage[]> {
  const q = opsChatViewerLocaleQuery(viewerLocale);
  const r = await apiFetch(`/api/operations/tasks/${encodeURIComponent(executionId)}/ops-chat${q}`);
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(typeof j.error === 'string' ? j.error : 'Não foi possível carregar as mensagens.');
  }
  const j = await r.json();
  return Array.isArray(j.messages) ? j.messages : [];
}

export async function postExecutionOpsChat(
  executionId: string,
  body: string,
  viewerLocale?: string | null,
): Promise<ExecutionOpsChatMessage> {
  const q = opsChatViewerLocaleQuery(viewerLocale);
  const r = await apiFetch(`/api/operations/tasks/${encodeURIComponent(executionId)}/ops-chat${q}`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(typeof j.error === 'string' ? j.error : 'Não foi possível enviar a mensagem.');
  }
  const m = j?.message;
  if (!m || typeof m.id !== 'string') {
    throw new Error('Resposta inválida do servidor.');
  }
  return {
    id: String(m.id),
    senderEmail: String(m.senderEmail || ''),
    senderKind: String(m.senderKind || ''),
    body: String(m.body || ''),
    displayBody: m.displayBody != null ? String(m.displayBody) : undefined,
    createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date(m.createdAt).toISOString(),
  };
}

export type OpsChatThreadSummary = {
  executionId: string;
  osNumber: string | null;
  routineTaskNumber: string | null;
  executionStatus?: string | null;
  title: string | null;
  lastMessageAt: string | null;
  lastPreview: string;
  lastSenderKind: string | null;
};

/** Lista FTs/RTs do técnico com pelo menos uma mensagem no chat operacional (JWT app). */
/**
 * Lista threads operacionais que ainda exigem atenção do técnico:
 * há pelo menos uma mensagem do gestor mais recente que o ack local.
 */
export async function listPendingGestorOpsThreadIds(
  preloadedThreads?: OpsChatThreadSummary[],
): Promise<string[]> {
  let threads = Array.isArray(preloadedThreads) ? preloadedThreads : null;
  if (!threads) {
    try {
      threads = await fetchMyOpsChatThreads();
    } catch {
      return [];
    }
  }
  if (!threads.length) return [];
  /** Limite de FTs a consultar por ciclo — evita rajada de pedidos quando há muitos fios. */
  const capped = threads.slice(0, 32);
  const pendingIds = new Set<string>();
  for (const t of capped) {
    const exId = String(t.executionId || '').trim();
    if (!exId) continue;
    try {
      const [msgs, ackStr] = await Promise.all([
        fetchExecutionOpsChat(exId),
        AsyncStorage.getItem(getOpsChatAckStorageKey(exId)),
      ]);
      const ack = ackStr ? Number(ackStr) : 0;
      for (const m of msgs) {
        if (String(m.senderKind || '').toUpperCase() !== 'GESTOR') continue;
        const ts = new Date(m.createdAt).getTime();
        if (Number.isFinite(ts) && ts > ack) {
          pendingIds.add(exId);
          break;
        }
      }
    } catch {
      /* ignore por FT */
    }
  }
  return [...pendingIds];
}

/**
 * Conta threads operacionais com mensagem pendente do gestor.
 * Usado no badge do separador «Conversas» (menu inferior).
 */
export async function countGestorUnreadAcrossOpsThreads(): Promise<number> {
  const ids = await listPendingGestorOpsThreadIds();
  return ids.length;
}

export async function fetchMyOpsChatThreads(): Promise<OpsChatThreadSummary[]> {
  const r = await apiFetch('/api/operations/my-ops-chat-threads');
  if (r.status === 403) return [];
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(typeof j.error === 'string' ? j.error : 'Não foi possível listar as conversas da operação.');
  }
  const j = await r.json();
  return Array.isArray(j.threads) ? j.threads : [];
}
