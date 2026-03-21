import { NotificationService } from './notifications';

const BASE_URL = 'http://192.168.0.13:3000'; // ajuste conforme o IP do servidor

export interface ChatRoom {
  id: string;
  name: string;
  description?: string;
  avatarColor: string;
  lastMessage?: string;
  lastSender?: string;
  lastMessageAt?: number;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  type: 'text' | 'audio' | 'video' | 'image';
  content?: string;
  mediaUrl?: string;
  timestamp: number;
}

// ID do usuário local (sem auth real, usa um ID fixo por dispositivo)
export const MY_USER_ID   = 'user_local';
export const MY_USER_NAME = 'Eu';

export const ChatService = {
  async getRooms(): Promise<ChatRoom[]> {
    try {
      const res = await fetch(`${BASE_URL}/api/chat/rooms`);
      return await res.json();
    } catch { return []; }
  },

  async getMessages(roomId: string, since: number = 0): Promise<ChatMessage[]> {
    try {
      const res = await fetch(`${BASE_URL}/api/chat/rooms/${roomId}/messages?since=${since}`);
      return await res.json();
    } catch { return []; }
  },

  async sendMessage(roomId: string, payload: {
    type: 'text' | 'audio' | 'video' | 'image';
    content?: string;
    mediaUrl?: string;
  }): Promise<ChatMessage | null> {
    try {
      const res = await fetch(`${BASE_URL}/api/chat/rooms/${roomId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId:   MY_USER_ID,
          senderName: MY_USER_NAME,
          ...payload,
        }),
      });
      const data = await res.json();
      return { id: data.id, roomId, senderId: MY_USER_ID, senderName: MY_USER_NAME, timestamp: data.timestamp, ...payload } as ChatMessage;
    } catch { return null; }
  },
};
