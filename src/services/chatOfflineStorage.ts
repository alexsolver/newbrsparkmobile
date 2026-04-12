import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage, ChatRoom } from './chat';

const roomsKey = (userId: string) => `@brspark_chat_rooms_cache:${userId}`;
const messagesKey = (userId: string, roomId: string) => `@brspark_chat_msgs_cache:${userId}:${roomId}`;
const outboxKey = (userId: string) => `@brspark_chat_outbox:${userId}`;

export type ChatOutboxItem = {
  localId: string;
  roomId: string;
  type: 'text' | 'image';
  content?: string;
  mediaUrl?: string;
  createdAt: number;
};

export async function loadRoomListCache(userId: string): Promise<ChatRoom[]> {
  try {
    const raw = await AsyncStorage.getItem(roomsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatRoom[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveRoomListCache(userId: string, rooms: ChatRoom[]): Promise<void> {
  try {
    await AsyncStorage.setItem(roomsKey(userId), JSON.stringify(rooms));
  } catch {
    /* ignore */
  }
}

export async function loadMessagesCache(userId: string, roomId: string): Promise<ChatMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(messagesKey(userId, roomId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveMessagesCache(userId: string, roomId: string, messages: ChatMessage[]): Promise<void> {
  try {
    await AsyncStorage.setItem(messagesKey(userId, roomId), JSON.stringify(messages));
  } catch {
    /* ignore */
  }
}

export async function loadOutbox(userId: string): Promise<ChatOutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(outboxKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatOutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveOutbox(userId: string, items: ChatOutboxItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(outboxKey(userId), JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export async function appendOutboxItem(userId: string, item: ChatOutboxItem): Promise<void> {
  const all = await loadOutbox(userId);
  all.push(item);
  await saveOutbox(userId, all);
}

/**
 * Envia mensagens em fila para uma sala, em ordem; para no primeiro erro de rede/servidor.
 * Devolve pares localId → mensagem confirmada pelo servidor.
 */
export async function flushChatOutboxForRoom(
  userId: string,
  roomId: string,
  send: (
    rid: string,
    payload: { type: ChatOutboxItem['type']; content?: string; mediaUrl?: string },
  ) => Promise<ChatMessage>,
): Promise<Array<{ localId: string; message: ChatMessage }>> {
  const all = await loadOutbox(userId);
  const others = all.filter((o) => o.roomId !== roomId);
  const mine = all.filter((o) => o.roomId === roomId).sort((a, b) => a.createdAt - b.createdAt);
  const results: Array<{ localId: string; message: ChatMessage }> = [];
  const kept: ChatOutboxItem[] = [];

  for (let i = 0; i < mine.length; i++) {
    const item = mine[i];
    try {
      const message = await send(item.roomId, {
        type: item.type,
        content: item.content,
        mediaUrl: item.mediaUrl,
      });
      results.push({ localId: item.localId, message });
    } catch {
      kept.push(...mine.slice(i));
      break;
    }
  }

  await saveOutbox(userId, [...others, ...kept]);
  return results;
}
