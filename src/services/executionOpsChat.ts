import { apiFetch } from './auth';

export type ExecutionOpsChatMessage = {
  id: string;
  senderEmail: string;
  senderKind: string;
  body: string;
  createdAt: string;
};

export async function fetchExecutionOpsChat(executionId: string): Promise<ExecutionOpsChatMessage[]> {
  const r = await apiFetch(`/api/operations/tasks/${encodeURIComponent(executionId)}/ops-chat`);
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(typeof j.error === 'string' ? j.error : 'Não foi possível carregar as mensagens.');
  }
  const j = await r.json();
  return Array.isArray(j.messages) ? j.messages : [];
}

export async function postExecutionOpsChat(executionId: string, body: string): Promise<void> {
  const r = await apiFetch(`/api/operations/tasks/${encodeURIComponent(executionId)}/ops-chat`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(typeof j.error === 'string' ? j.error : 'Não foi possível enviar a mensagem.');
  }
}
