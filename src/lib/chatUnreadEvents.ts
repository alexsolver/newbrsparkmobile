import { DeviceEventEmitter } from 'react-native';

export const CHAT_UNREAD_CHANGED_EVENT = 'CHAT_UNREAD_CHANGED_EVENT';

export function emitChatUnreadChanged(): void {
  DeviceEventEmitter.emit(CHAT_UNREAD_CHANGED_EVENT);
}
