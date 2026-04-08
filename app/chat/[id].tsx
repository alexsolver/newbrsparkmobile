import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Modal, ScrollView, Image
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { ChatService, ChatMessage, ChatRoom, ChatMessagingState } from '../../src/services/chat';
import { ColorPalette, MEDIA_TAG_COLORS, SERVICE_CATEGORY_COLORS } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/hooks/useAuth';

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

type MediaAttach = { type: 'audio' | 'video' | 'image'; uri: string } | null;

export default function ChatRoomScreen() {
  const { id: roomId, name, color, avatarUrl } = useLocalSearchParams<{ id: string; name: string; color: string; avatarUrl?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createChatRoomStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const flatRef = useRef<FlatList>(null);

  const [roomInfo, setRoomInfo] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  
  const [attach, setAttach] = useState<MediaAttach>(null);
  const [showAttach, setShowAttach] = useState(false);
  
  const lastTs = useRef(0);
  const pollRef = useRef<any>(null);

  // Modal Settings
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [savingMembers, setSavingMembers] = useState(false);

  const [messagingState, setMessagingState] = useState<ChatMessagingState | null>(null);

  const loadMessagingState = useCallback(async () => {
    const s = await ChatService.getMessagingState(roomId!);
    if (s) setMessagingState(s);
  }, [roomId]);

  const loadRoomInfo = useCallback(async () => {
    const info = await ChatService.getRoomInfo(roomId!);
    setRoomInfo(info);
    if (info) {
      setSelectedContacts(info.members.map(m => m.userId || m.email));
    }
    const c = await ChatService.getAvailableContacts();
    setContacts(c || []);
  }, [roomId]);

  const loadMessages = useCallback(async (since = 0) => {
    const msgs = await ChatService.getMessages(roomId!, since);
    if (msgs.length > 0) {
      setMessages(prev => {
        const ids = new Set(prev.map(m => m.id));
        const fresh = msgs.filter(m => !ids.has(m.id));
        return [...prev, ...fresh];
      });
      lastTs.current = msgs[msgs.length - 1].timestamp;
    }
  }, [roomId]);

  useEffect(() => {
    loadRoomInfo();
    loadMessagingState();
    ChatService.getMessages(roomId!, 0).then(msgs => {
      setMessages(msgs);
      if (msgs.length > 0) lastTs.current = msgs[msgs.length - 1].timestamp;
      ChatService.markAsRead(roomId!).catch(() => {});
    });
  }, [roomId, loadRoomInfo, loadMessagingState]);

  useEffect(() => {
    pollRef.current = setInterval(() => {
      loadMessagingState();
      if (lastTs.current > 0) loadMessages(lastTs.current);
      else loadMessages(0);
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [loadMessages, loadMessagingState]);

  // Track whether initial messages have been loaded to control scroll animation
  const initialScrollDone = useRef(false);

  const scrollToBottom = (animated = true) => {
    flatRef.current?.scrollToEnd({ animated });
  };

  useEffect(() => {
    if (messages.length > 0 && initialScrollDone.current) {
      // New messages arrived via polling — scroll animated
      scrollToBottom(true);
    }
  }, [messages.length]);

  const [uploading, setUploading] = useState(false);

  const chatInputLocked =
    messagingState != null &&
    messagingState.technicianClientGated &&
    !messagingState.messagingActive;

  useEffect(() => {
    if (chatInputLocked) setShowAttach(false);
  }, [chatInputLocked]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && !attach) return;
    if (chatInputLocked) {
      Alert.alert(
        'Chat inativo',
        'Só é possível enviar mensagens durante o início ou a conclusão da atividade (enquanto a OS estiver em andamento ou concluída aguardando sincronização).',
      );
      return;
    }
    setSending(true);

    try {
      let resolvedMediaUrl: string | undefined = undefined;

      // Upload media to server first so the URL is public (accessible by recipient)
      if (attach) {
        setUploading(true);
        const mimeMap: Record<string, string> = { image: 'image/jpeg', video: 'video/mp4', audio: 'audio/m4a' };
        const mimeType = mimeMap[attach.type] || 'application/octet-stream';
        const uploaded = await ChatService.uploadChatMedia(attach.uri, mimeType);
        setUploading(false);

        if (uploaded) {
          resolvedMediaUrl = uploaded;
        } else {
          // Fallback: use local URI (sender sees it, but recipient won't — warn)
          console.warn('[Chat] Upload falhou, usando URI local como fallback');
          resolvedMediaUrl = attach.uri;
        }
      }

      const payload = attach
        ? { type: attach.type, content: trimmed || undefined, mediaUrl: resolvedMediaUrl }
        : { type: 'text' as const, content: trimmed };

      const msg = await ChatService.sendMessage(roomId!, payload as any);
      setMessages(prev => [...prev, msg]);
      lastTs.current = msg.timestamp;
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao enviar mensagem');
    }

    setText('');
    setAttach(null);
    setShowAttach(false);
    setSending(false);
    setUploading(false);
  };


  const pickVideo = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) return Alert.alert('Permissão negada');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.7, videoMaxDuration: 60 });
    if (!result.canceled && result.assets[0]) { setAttach({ type: 'video', uri: result.assets[0].uri }); setShowAttach(false); }
  };

  const pickImage = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) return Alert.alert('Permissão negada');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) { setAttach({ type: 'image', uri: result.assets[0].uri }); setShowAttach(false); }
  };

  const takeCamera = async () => {
    try {
      const permRes = await ImagePicker.requestCameraPermissionsAsync();
      if (!permRes.granted) {
        Alert.alert('Permissão Negada', 'Conceda acesso à câmera nas configurações.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const isVideo = result.assets[0].type === 'video';
        setAttach({ type: isVideo ? 'video' : 'image', uri: result.assets[0].uri });
        setShowAttach(false);
      }
    } catch (e: any) {
      console.warn('[Camera]', e);
      Alert.alert(
        'Câmera Indisponível',
        'A câmera não está disponível no simulador iOS. Teste em um dispositivo físico.',
      );
    }
  };

  const handleSaveMembers = async () => {
    setSavingMembers(true);
    try {
      await ChatService.updateGroupMembers(roomId!, selectedContacts);
      await loadRoomInfo();
      Alert.alert('Sucesso', 'Membros do grupo atualizados');
      setSettingsVisible(false);
    } catch (error: any) {
      Alert.alert('Erro', error.message || 'Falha ao atualizar grupo');
    }
    setSavingMembers(false);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.senderId === user?.email;

    const bubble = () => {
      if (item.type === 'audio') return (
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <Ionicons name="mic" size={18} color={isMe ? '#fff' : C.primary} />
          <Text style={[styles.bubbleText, isMe && { color: '#fff' }]}>Mensagem de áudio</Text>
        </View>
      );
      if (item.type === 'video') return (
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
          <Ionicons name="videocam" size={18} color={isMe ? '#fff' : C.primary} />
          <Text style={[styles.bubbleText, isMe && { color: '#fff' }]}>Vídeo enviado</Text>
        </View>
      );
      // Image: render actual thumbnail
      if (item.type === 'image') {
        const imageUri = item.mediaUrl || (item as any).content;
        if (imageUri) {
          return (
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, { padding: 4 }]}>
              {!isMe && <Text style={[styles.senderName, { marginBottom: 4, marginLeft: 4 }]}>{item.senderName || item.senderId}</Text>}
              <Image
                source={{ uri: imageUri }}
                style={{ width: 220, height: 160, borderRadius: 14 }}
                resizeMode="cover"
              />
              {item.content ? (
                <Text style={[styles.bubbleText, isMe && { color: '#fff' }, { marginTop: 6, marginHorizontal: 4 }]}>{item.content}</Text>
              ) : null}
            </View>
          );
        }
        return (
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <Ionicons name="image" size={18} color={isMe ? '#fff' : C.primary} />
            <Text style={[styles.bubbleText, isMe && { color: '#fff' }]}>Imagem enviada</Text>
          </View>
        );
      }
      return (
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          {!isMe && <Text style={styles.senderName}>{item.senderName || item.senderId}</Text>}
          <Text style={[styles.bubbleText, isMe && { color: '#fff' }]}>{item.content}</Text>
        </View>
      );
    };

    return (
      <View style={[styles.messageRow, isMe && { justifyContent: 'flex-end' }]}>
        {!isMe && (
          <View style={[styles.msgAvatar, { backgroundColor: color || MEDIA_TAG_COLORS.BEFORE }]}>
            {item.senderAvatarUrl ? (
               <Image source={{ uri: item.senderAvatarUrl }} style={{ width: 28, height: 28, borderRadius: 14 }} />
            ) : (
               <Text style={styles.msgAvatarText}>{(item.senderName || item.senderId || '?')[0].toUpperCase()}</Text>
            )}
          </View>
        )}
        <View style={{ maxWidth: '75%' }}>
          {bubble()}
          <Text style={[styles.msgTime, isMe && { textAlign: 'right' }]}>{formatTime(item.timestamp)}</Text>
        </View>
      </View>
    );
  };

  const isCreator = roomInfo?.creatorId === user?.email;

  const headerSubtitle = roomInfo
    ? roomInfo.isGroup
      ? `${roomInfo.memberCount} membros`
      : chatInputLocked
        ? 'Chat inativo (fora da atividade)'
        : 'Chat privado'
    : 'Carregando...';

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: C.cardWhite }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={C.primary} />
        </TouchableOpacity>

        <View style={[styles.headerAvatar, { backgroundColor: color || MEDIA_TAG_COLORS.BEFORE }]}>
          {avatarUrl ? (
             <Image source={{ uri: avatarUrl }} style={{ width: 42, height: 42, borderRadius: 21 }} />
          ) : (
             <Text style={styles.headerAvatarText}>{(name || 'C')[0]?.toUpperCase() || 'C'}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
          <Text style={styles.headerSub}>{headerSubtitle}</Text>
        </View>
        {roomInfo?.isGroup && (
          <TouchableOpacity onPress={() => setSettingsVisible(true)} style={styles.settingsBtn}>
            <Ionicons name="settings-outline" size={22} color={C.primary} />
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.background }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 60}
      >
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.messageList}
          renderItem={renderMessage}
          keyboardShouldPersistTaps="handled"
          // Scroll to bottom when content is measured (handles initial load reliably)
          onContentSizeChange={() => {
            if (!initialScrollDone.current) {
              // First render: instant scroll to bottom (no animation flash)
              scrollToBottom(false);
              initialScrollDone.current = true;
            }
          }}
          onLayout={() => {
            if (!initialScrollDone.current) {
              scrollToBottom(false);
            }
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubble-ellipses-outline" size={52} color={C.border} />
              <Text style={styles.emptyText}>Sem mensagens ainda{'\n'}Seja o primeiro a escrever!</Text>
            </View>
          }
        />

        {chatInputLocked && (
          <View style={styles.lockedBanner}>
            <Ionicons name="lock-closed-outline" size={18} color={C.status.warning.fg} />
            <Text style={styles.lockedBannerText}>
              Mensagens só durante a atividade: quando a OS estiver em andamento ou em conclusão (antes da sincronização final).
            </Text>
          </View>
        )}

        {attach && (
          <View style={styles.attachPreview}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {uploading ? (
                <>
                  <ActivityIndicator size="small" color={C.primary} />
                  <Text style={{ marginLeft: 8, fontWeight: '700', color: C.primary }}>Enviando mídia...</Text>
                </>
              ) : (
                <>
                  <Ionicons name={attach.type === 'image' ? 'image' : attach.type === 'video' ? 'videocam' : 'mic'} size={24} color={C.primary} />
                  {attach.type === 'image' ? (
                    <Image source={{ uri: attach.uri }} style={{ width: 44, height: 44, borderRadius: 8, marginLeft: 8 }} />
                  ) : (
                    <Text style={{ marginLeft: 8, fontWeight: '600', color: C.slate }}>Arquivo anexado</Text>
                  )}
                </>
              )}
            </View>
            <TouchableOpacity onPress={() => setAttach(null)} disabled={uploading}>
              <Ionicons name="close-circle" size={24} color={uploading ? C.border : C.textLight} />
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.inputArea, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            onPress={() => setShowAttach(!showAttach)}
            style={styles.iconBtn}
            disabled={uploading || chatInputLocked}
          >
            <Ionicons
              name="add"
              size={28}
              color={uploading || chatInputLocked ? C.border : C.textSecondary}
            />
          </TouchableOpacity>

          
          <TextInput
            style={[styles.input, chatInputLocked && { opacity: 0.55 }]}
            placeholder={chatInputLocked ? 'Chat inativo…' : 'Digite algo...'}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            editable={!chatInputLocked}
           returnKeyType="done"/>
          
          <TouchableOpacity
            onPress={handleSend}
            style={[
              styles.sendBtn,
              (sending || uploading || chatInputLocked || (!text.trim() && !attach)) && { opacity: 0.4 },
            ]}
            disabled={sending || uploading || chatInputLocked || (!text.trim() && !attach)}
          >
            {sending || uploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>

        {showAttach && !chatInputLocked && (
          <View style={styles.attachMenu}>
            <TouchableOpacity style={styles.attachMenuItem} onPress={takeCamera}>
              <View style={[styles.attachIconBg, { backgroundColor: C.status.info.bg }]}><Ionicons name="camera" size={22} color={SERVICE_CATEGORY_COLORS.Tecnologia} /></View>
              <Text style={styles.attachMenuText}>Câmera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachMenuItem} onPress={pickImage}>
              <View style={[styles.attachIconBg, { backgroundColor: C.status.danger.bg }]}><Ionicons name="image" size={22} color={C.destructive} /></View>
              <Text style={styles.attachMenuText}>Foto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachMenuItem} onPress={pickVideo}>
              <View style={[styles.attachIconBg, { backgroundColor: C.status.warning.bg }]}><Ionicons name="videocam" size={22} color={C.warning.text} /></View>
              <Text style={styles.attachMenuText}>Vídeo</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* MODAL GROUP SETTINGS */}
      <Modal visible={settingsVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Configurações do Grupo</Text>
              <TouchableOpacity onPress={() => setSettingsVisible(false)}>
                 <Ionicons name="close" size={26} color={C.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.sectionTitle}>Membros ({roomInfo?.memberCount})</Text>
              
              {!isCreator && (
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle" size={20} color={C.primary} />
                  <Text style={styles.infoText}>Apenas o administrador do grupo ({roomInfo?.creatorId}) pode adicionar ou remover participantes.</Text>
                </View>
              )}

              {/* Se for criador, pode mudar checkboxes */}
              {isCreator ? (
                <View>
                  {contacts.length === 0 ? (
                    <Text style={{ fontSize: 13, color: C.textSecondary, marginTop: 10 }}>Nenhum contato disponível.</Text>
                  ) : (
                    contacts.map(c => {
                      const isSelected = selectedContacts.includes(c.email);
                      return (
                        <TouchableOpacity 
                          key={c.email} 
                          style={styles.contactItem} 
                          onPress={() => {
                            if (isSelected) setSelectedContacts(prev => prev.filter(email => email !== c.email));
                            else setSelectedContacts(prev => [...prev, c.email]);
                          }}
                        >
                          <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.contactName}>{c.name}</Text>
                            <Text style={styles.contactEmail}>{c.email}</Text>
                          </View>
                        </TouchableOpacity>
                      )
                    })
                  )}
                  <TouchableOpacity style={[styles.primaryBtn, savingMembers && { opacity: 0.5 }]} disabled={savingMembers} onPress={handleSaveMembers}>
                    {savingMembers ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Salvar Alterações</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                /* Se não for criador, apenas visualiza */
                <View>
                  {roomInfo?.members.map(m => (
                    <View key={m.userId || m.email} style={styles.contactItem}>
                      <View style={[styles.avatarFixed, { backgroundColor: C.textLight }]}>
                        {m.avatarUrl ? (
                          <Image source={{ uri: m.avatarUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                        ) : (
                          <Text style={{ color: '#fff', fontWeight: '800' }}>
                            {((m.name || m.userId || '?')[0] || '?').toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.contactName}>{m.name || m.userId}</Text>
                        <Text style={styles.contactEmail}>{m.role}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

function createChatRoomStyles(C: ColorPalette) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 14,
    backgroundColor: C.cardWhite,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: { padding: 8, marginRight: 8 },
  settingsBtn: { padding: 8 },
  headerAvatar: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  headerName: { fontSize: 17, fontWeight: '800', color: C.slate },
  headerSub: { fontSize: 12, color: C.textSecondary, fontWeight: '500' },
  
  messageList: { padding: 16, paddingBottom: 32 },
  empty: { alignItems: 'center', marginTop: 100 },
  emptyText: { fontSize: 15, color: C.textLight, textAlign: 'center', marginTop: 12, lineHeight: 22 },
  
  messageRow: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  msgAvatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  
  bubble: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  bubbleThem: { backgroundColor: C.cardWhite, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.border },
  bubbleMe: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 15, color: C.slate, lineHeight: 22 },
  senderName: { fontSize: 11, color: C.primary, fontWeight: '800', marginBottom: 4 },
  msgTime: { fontSize: 10, color: C.textLight, marginTop: 4, fontWeight: '600' },
  
  lockedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 8,
    padding: 12,
    backgroundColor: C.status.warning.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.status.warning.border,
  },
  lockedBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: C.status.warning.fg,
    lineHeight: 17,
  },
  inputArea: {
    flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: C.cardWhite, padding: 12, paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    borderTopWidth: 1, borderTopColor: C.border
  },
  input: {
    flex: 1, backgroundColor: C.surfaceLow, minHeight: 44, maxHeight: 100,
    borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    fontSize: 15, color: C.slate, marginHorizontal: 8
  },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 22 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center' },
  
  attachPreview: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.status.info.bg, margin: 12, padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: C.status.info.border,
  },
  attachMenu: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: C.cardWhite, paddingVertical: 20,
    borderTopWidth: 1, borderTopColor: C.border
  },
  attachMenuItem: { alignItems: 'center', gap: 8 },
  attachIconBg: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  attachMenuText: { fontSize: 12, color: C.slate, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.cardWhite, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: C.slate, letterSpacing: -0.5 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: C.textSecondary, textTransform: 'uppercase', marginBottom: 16 },
  
  infoBox: { flexDirection: 'row', backgroundColor: C.status.info.bg, padding: 12, borderRadius: 8, marginBottom: 16 },
  infoText: { flex: 1, fontSize: 12, color: C.primary, marginLeft: 8, lineHeight: 18 },

  contactItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.background },
  contactName: { fontSize: 15, fontWeight: '800', color: C.slate },
  contactEmail: { fontSize: 12, color: C.textSecondary, fontWeight: '500' },
  
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.border, marginRight: 14, justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: C.accent, borderColor: C.accent },
  
  avatarFixed: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 12 },

  primaryBtn: { backgroundColor: C.accent, padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 24 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  });
}
