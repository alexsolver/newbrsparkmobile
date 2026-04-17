import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './auth';
import type { ChatMessage } from './chat';

/** ID virtual da “sala” no cache local — evita colisão com IDs de salas do chat corporativo. */
export function getOpsChatCacheRoomId(executionId: string): string {
  return `ops:${String(executionId || '').trim()}`;
}

/** Última vez que o técnico “viu” o fio no app (ms desde epoch) — usado para o ponto no ícone. */
export function getOpsChatAckStorageKey(executionId: string): string {
  return `@brspark_ops_chat_ack_${String(executionId || '').trim()}`;
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
    let maxMs = 0;
    for (const m of rows) {
      const t = new Date(m.createdAt).getTime();
      if (Number.isFinite(t) && t > maxMs) maxMs = t;
    }
    await AsyncStorage.setItem(getOpsChatAckStorageKey(executionId), String(maxMs));
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
  title: string | null;
  lastMessageAt: string | null;
  lastPreview: string;
  lastSenderKind: string | null;
};

/** Lista FTs/RTs do técnico com pelo menos uma mensagem no chat operacional (JWT app). */
/**
 * Conta mensagens do **gestor** mais recentes que o ack local (`persistOpsChatReadAck`), em todas as FTs com fio.
 * Usado no badge do separador «Conversas» (menu inferior).
 */
export async function countGestorUnreadAcrossOpsThreads(): Promise<number> {
  let threads: OpsChatThreadSummary[];
  try {
    threads = await fetchMyOpsChatThreads();
  } catch {
    return 0;
  }
  if (!threads.length) return 0;
  /** Limite de FTs a consultar por ciclo — evita rajada de pedidos quando há muitos fios. */
  const capped = threads.slice(0, 32);
  let total = 0;
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
        if (Number.isFinite(ts) && ts > ack) total += 1;
      }
    } catch {
      /* ignore por FT */
    }
  }
  return total;
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
