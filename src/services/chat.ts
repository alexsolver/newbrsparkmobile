import { apiFetch, API_BASE } from './auth';
import { emitChatUnreadChanged } from '../lib/chatUnreadEvents';

export interface ChatContact {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  user?: { email: string; name: string; avatarUrl?: string };
}

export interface ChatRoom {
  id: string;
  name: string;
  isGroup: boolean;
  creatorId?: string;
  avatarColor: string;
  avatarUrl?: string;
  lastMessage?: string;
  lastSender?: string;
  lastMessageAt?: number;
  memberCount: number;
  unreadCount?: number;
  members: any[];
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  type: 'text' | 'audio' | 'video' | 'image';
  content?: string;
  /** Texto a mostrar (traduzido para o seu idioma quando aplicável). */
  displayContent?: string;
  mediaUrl?: string;
  timestamp: number;
  /** Mensagem na fila offline — ainda não confirmada pelo servidor */
  pending?: boolean;
}

/** Sala técnico–cliente: envio só permitido após início do deslocamento, com OS em atendimento (servidor). */
export interface ChatMessagingState {
  technicianClientGated: boolean;
  messagingActive: boolean;
}

export const ChatService = {

  // ---- CONTATOS ----

  async requestContact(email: string): Promise<any> {
    const res = await apiFetch('/api/chat/contacts/request', {
      method: 'POST', body: JSON.stringify({ contactEmail: email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao enviar convite');
    return data;
  },

  async getPendingContacts(): Promise<ChatContact[]> {
    try {
      const res = await apiFetch('/api/chat/contacts/pending');
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  async updateContactStatus(id: string, status: 'ACCEPTED' | 'REJECTED'): Promise<any> {
    const res = await apiFetch(`/api/chat/contacts/${id}/status`, {
      method: 'PUT', body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar status');
    return data;
  },

  async getAvailableContacts(): Promise<any[]> {
    try {
      const res = await apiFetch('/api/chat/contacts');
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  // ---- SALAS ----

  async createRoom(params: { isGroup: boolean; name?: string; userIds: string[] }): Promise<ChatRoom> {
    const res = await apiFetch('/api/chat/rooms', {
      method: 'POST', body: JSON.stringify(params)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao criar sala');
    return data;
  },

  async updateGroupMembers(roomId: string, userIds: string[]): Promise<any> {
    const res = await apiFetch(`/api/chat/rooms/${roomId}/members`, {
      method: 'PUT', body: JSON.stringify({ userIds })
    });
    return res.json();
  },

  async getRooms(): Promise<ChatRoom[]> {
    try {
      const res = await apiFetch('/api/chat/rooms');
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  async markAsRead(roomId: string): Promise<void> {
    const res = await apiFetch(`/api/chat/rooms/${roomId}/read`, { method: 'PUT' });
    if (res.ok) emitChatUnreadChanged();
  },

  async getRoomInfo(roomId: string): Promise<ChatRoom | null> {
    const rooms = await this.getRooms();
    return rooms.find(r => r.id === roomId) || null;
  },

  async getMessagingState(roomId: string): Promise<ChatMessagingState | null> {
    try {
      const res = await apiFetch(`/api/chat/rooms/${roomId}/messaging-state`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  // ---- MENSAGENS ----

  async getMessages(roomId: string, since: number = 0, viewerLocale?: string | null): Promise<ChatMessage[]> {
    try {
      const q = new URLSearchParams();
      q.set('since', String(since));
      if (viewerLocale != null && String(viewerLocale).trim() !== '') {
        q.set('viewerLocale', String(viewerLocale).trim());
      }
      const res = await apiFetch(`/api/chat/rooms/${roomId}/messages?${q.toString()}`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  },

  async sendMessage(roomId: string, payload: {
    type: 'text' | 'image';
    content?: string;
    mediaUrl?: string;
  }): Promise<ChatMessage> {
    const res = await apiFetch(`/api/chat/rooms/${roomId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao enviar mensagem');
    return data;
  },

  /**
   * Faz upload de mídia local para o servidor e retorna a URL pública.
   * Usa a mesma rota de storage do app (POST /api/storage/upload).
   * Se o upload falhar, retorna null e o app pode tratar com fallback.
   */
  async uploadChatMedia(localUri: string, mimeType: string): Promise<string | null> {
    try {
      // Lê o arquivo como base64
      const response = await fetch(localUri);
      const blob = await response.blob();

      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            // FileReader result: "data:image/jpeg;base64,AAAA..."
            const base64 = (reader.result as string).split(',')[1];
            const ext = mimeType.split('/')[1] || 'jpg';
            const remotePath = `chat/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

            const uploadRes = await apiFetch('/api/storage/upload', {
              method: 'POST',
              body: JSON.stringify({ fileBase64: base64, mimeType, name: remotePath, path: remotePath }),
            });

            if (!uploadRes.ok) { resolve(null); return; }
            const { url } = await uploadRes.json();
            resolve(url || null);
          } catch (e) {
            console.warn('[ChatUpload] Erro ao processar base64:', e);
            resolve(null);
          }
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('[ChatUpload] Erro de upload:', e);
      return null;
    }
  },
};

