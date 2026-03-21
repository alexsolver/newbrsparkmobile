import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { ChatService, ChatMessage, MY_USER_ID, MY_USER_NAME } from '../../src/services/chat';
import { colors } from '../../src/theme/colors';
import { NotificationService } from '../../src/services/notifications';

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

type MediaAttach = { type: 'audio' | 'video' | 'image'; uri: string } | null;

export default function ChatRoomScreen() {
  const { id: roomId, name, color } = useLocalSearchParams<{ id: string; name: string; color: string }>();
  const router = useRouter();
  const flatRef = useRef<FlatList>(null);

  const [messages,    setMessages]    = useState<ChatMessage[]>([]);
  const [text,        setText]        = useState('');
  const [sending,     setSending]     = useState(false);
  const [recording,   setRecording]   = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [attach,      setAttach]      = useState<MediaAttach>(null);
  const [showAttach,  setShowAttach]  = useState(false);
  const lastTs = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const loadMessages = useCallback(async (since = 0) => {
    const msgs = await ChatService.getMessages(roomId!, since);
    if (msgs.length > 0) {
      setMessages(prev => {
        const ids = new Set(prev.map(m => m.id));
        const fresh = msgs.filter(m => !ids.has(m.id));
        if (fresh.length > 0) {
          // Notifica mensagens de outros
          fresh.filter(m => m.senderId !== MY_USER_ID).forEach(m => {
            NotificationService.addNotification({
              title: `${name}: ${m.senderName}`,
              body: m.type === 'text' ? (m.content || '') : `📎 ${m.type}`,
              category: 'info',
            });
          });
          return [...prev, ...fresh];
        }
        return prev;
      });
      lastTs.current = msgs[msgs.length - 1].timestamp;
    }
  }, [roomId, name]);

  // Carga inicial
  useEffect(() => {
    ChatService.getMessages(roomId!, 0).then(msgs => {
      setMessages(msgs);
      if (msgs.length > 0) lastTs.current = msgs[msgs.length - 1].timestamp;
    });
  }, [roomId]);

  // Polling a cada 3s para novas mensagens
  useEffect(() => {
    pollRef.current = setInterval(() => {
      if (lastTs.current > 0) loadMessages(lastTs.current);
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [loadMessages]);

  // Auto-scroll
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // ── Envio ────────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && !attach) return;
    setSending(true);

    const payload = attach
      ? { type: attach.type, content: trimmed || undefined, mediaUrl: attach.uri }
      : { type: 'text' as const, content: trimmed };

    const msg = await ChatService.sendMessage(roomId!, payload as any);
    if (msg) {
      setMessages(prev => [...prev, msg]);
      lastTs.current = msg.timestamp;
    }
    setText('');
    setAttach(null);
    setShowAttach(false);
    setSending(false);
  };

  // ── Gravação de Áudio ─────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { Alert.alert('Permissão negada', 'Conceda acesso ao microfone.'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec);
      setIsRecording(true);
    } catch (e) { Alert.alert('Erro', 'Não foi possível iniciar gravação.'); }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    if (uri) {
      setAttach({ type: 'audio', uri });
      setShowAttach(false);
    }
  };

  // ── Seleção de Vídeo/Imagem ───────────────────────────────────────────────────
  const pickVideo = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) { Alert.alert('Permissão negada'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.7,
      videoMaxDuration: 60,
    });
    if (!result.canceled && result.assets[0]) {
      setAttach({ type: 'video', uri: result.assets[0].uri });
      setShowAttach(false);
    }
  };

  const pickImage = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) { Alert.alert('Permissão negada'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setAttach({ type: 'image', uri: result.assets[0].uri });
      setShowAttach(false);
    }
  };

  const takeCamera = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) { Alert.alert('Permissão negada'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const isVideo = result.assets[0].type === 'video';
      setAttach({ type: isVideo ? 'video' : 'image', uri: result.assets[0].uri });
      setShowAttach(false);
    }
  };

  // ── Render da Mensagem ────────────────────────────────────────────────────────
  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.senderId === MY_USER_ID;

    const bubble = () => {
      if (item.type === 'audio') return (
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <Ionicons name="mic" size={18} color={isMe ? '#fff' : colors.primary} />
          <Text style={[styles.bubbleText, isMe && { color: '#fff' }]}>Áudio gravado</Text>
        </View>
      );
      if (item.type === 'video') return (
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <Ionicons name="videocam" size={18} color={isMe ? '#fff' : colors.primary} />
          <Text style={[styles.bubbleText, isMe && { color: '#fff' }]}>Vídeo enviado</Text>
        </View>
      );
      if (item.type === 'image') return (
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <Ionicons name="image" size={18} color={isMe ? '#fff' : colors.primary} />
          <Text style={[styles.bubbleText, isMe && { color: '#fff' }]}>Imagem enviada</Text>
        </View>
      );
      return (
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          {!isMe && <Text style={styles.senderName}>{item.senderName}</Text>}
          <Text style={[styles.bubbleText, isMe && { color: '#fff' }]}>{item.content}</Text>
        </View>
      );
    };

    return (
      <View style={[styles.messageRow, isMe && { justifyContent: 'flex-end' }]}>
        {!isMe && (
          <View style={[styles.msgAvatar, { backgroundColor: color || '#2563EB' }]}>
            <Text style={styles.msgAvatarText}>{item.senderName[0]}</Text>
          </View>
        )}
        <View style={{ maxWidth: '75%' }}>
          {bubble()}
          <Text style={[styles.msgTime, isMe && { textAlign: 'right' }]}>{formatTime(item.timestamp)}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View style={[styles.headerAvatar, { backgroundColor: color || '#2563EB' }]}>
          <Text style={styles.headerAvatarText}>{(name || 'C')[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{name}</Text>
          <Text style={styles.headerSub}>Canal corporativo</Text>
        </View>
      </View>

      {/* Mensagens */}
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={styles.messageList}
        renderItem={renderMessage}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubble-ellipses-outline" size={52} color={colors.border} />
            <Text style={styles.emptyText}>Sem mensagens ainda{'\n'}Seja o primeiro a escrever!</Text>
          </View>
        }
      />

      {/* Pré-visualização de anexo */}
      {attach && (
        <View style={styles.attachPreview}>
          <Ionicons name={attach.type === 'audio' ? 'mic' : attach.type === 'video' ? 'videocam' : 'image'} size={20} color={colors.primary} />
          <Text style={styles.attachPreviewText}>{attach.type === 'audio' ? 'Áudio gravado' : attach.type === 'video' ? 'Vídeo selecionado' : 'Imagem selecionada'}</Text>
          <TouchableOpacity onPress={() => setAttach(null)}>
            <Ionicons name="close-circle" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      )}

      {/* Painel de anexos */}
      {showAttach && (
        <View style={styles.attachPanel}>
          <TouchableOpacity style={styles.attachBtn} onPress={isRecording ? stopRecording : startRecording}>
            <View style={[styles.attachIcon, { backgroundColor: isRecording ? '#EF4444' : '#6366F1' }]}>
              <Ionicons name={isRecording ? 'stop' : 'mic'} size={24} color="#fff" />
            </View>
            <Text style={styles.attachLabel}>{isRecording ? 'Parar Gravação' : 'Gravar Áudio'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachBtn} onPress={pickVideo}>
            <View style={[styles.attachIcon, { backgroundColor: '#F59E0B' }]}>
              <Ionicons name="videocam" size={24} color="#fff" />
            </View>
            <Text style={styles.attachLabel}>Vídeo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachBtn} onPress={pickImage}>
            <View style={[styles.attachIcon, { backgroundColor: '#10B981' }]}>
              <Ionicons name="image" size={24} color="#fff" />
            </View>
            <Text style={styles.attachLabel}>Galeria</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachBtn} onPress={takeCamera}>
            <View style={[styles.attachIcon, { backgroundColor: '#3B82F6' }]}>
              <Ionicons name="camera" size={24} color="#fff" />
            </View>
            <Text style={styles.attachLabel}>Câmera</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input Bar */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inputBar}>
          <TouchableOpacity style={[styles.iconBtn, showAttach && { backgroundColor: colors.primary + '20' }]} onPress={() => setShowAttach(v => !v)}>
            <Ionicons name={showAttach ? 'close' : 'add-circle-outline'} size={26} color={colors.primary} />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Escreva uma mensagem..."
            placeholderTextColor={colors.textLight}
            multiline
          />

          {isRecording ? (
            <TouchableOpacity style={styles.sendBtn} onPress={stopRecording}>
              <Ionicons name="stop" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (text.trim() || attach) ? (
            <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending}>
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.sendBtn, { backgroundColor: '#6366F1' }]} onPressIn={startRecording} onPressOut={stopRecording}>
              <Ionicons name="mic" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.cardWhite, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerAvatarText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  headerName: { fontSize: 16, fontWeight: '800', color: colors.primary },
  headerSub:  { fontSize: 11, color: colors.textSecondary },

  messageList: { padding: 16, paddingBottom: 8 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  msgAvatarText: { color: '#fff', fontSize: 11, fontWeight: '900' },

  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 2 },
  bubbleThem: { backgroundColor: colors.cardWhite, borderTopLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleMe:   { backgroundColor: colors.primary, borderTopRightRadius: 4 },
  senderName: { fontSize: 11, fontWeight: '800', color: colors.primary, marginBottom: 4 },
  bubbleText: { fontSize: 15, color: colors.primary, lineHeight: 20 },
  msgTime: { fontSize: 10, color: colors.textLight, paddingHorizontal: 4, marginTop: 2 },

  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', fontWeight: '600', lineHeight: 22 },

  attachPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 8, padding: 10,
    backgroundColor: colors.primary + '10', borderRadius: 10,
    borderWidth: 1, borderColor: colors.primary + '30',
  },
  attachPreviewText: { flex: 1, fontSize: 13, color: colors.primary, fontWeight: '700' },

  attachPanel: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: colors.cardWhite, paddingVertical: 16, paddingHorizontal: 8,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  attachBtn: { alignItems: 'center', gap: 6 },
  attachIcon: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  attachLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.cardWhite, borderTopWidth: 1, borderTopColor: colors.border,
  },
  iconBtn: { padding: 4, borderRadius: 8 },
  input: {
    flex: 1, minHeight: 40, maxHeight: 120, backgroundColor: '#F1F5F9',
    borderRadius: 20, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10,
    fontSize: 15, color: colors.primary, fontWeight: '500',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
});
