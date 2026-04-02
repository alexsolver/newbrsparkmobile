import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl,
  ActivityIndicator, Modal, ScrollView, TextInput, Alert,
  KeyboardAvoidingView, Platform, Image, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChatService, ChatRoom, ChatContact } from '../../src/services/chat';
import { colors } from '../../src/theme/colors';
import { useAuth } from '../../src/hooks/useAuth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ARCHIVED_KEY = '@brspark_archived_rooms';

function timeAgo(ts?: number) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Agora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

type FilterTab = 'ALL' | 'UNREAD' | 'GROUPS' | 'ARCHIVED';

const FILTERS: { id: FilterTab; label: string }[] = [
  { id: 'ALL', label: 'Todas' },
  { id: 'UNREAD', label: 'Não lidas' },
  { id: 'GROUPS', label: 'Grupos' },
  { id: 'ARCHIVED', label: 'Arquivadas' },
];

export default function ChatScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [pending, setPending] = useState<ChatContact[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

  // Modals state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTab, setModalTab] = useState<'CONTACTS' | 'GROUP' | 'ADD'>('CONTACTS');

  // New Contact
  const [newEmail, setNewEmail] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);

  // New Group
  const [groupName, setGroupName] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);

  // Archive action swipe state
  const [longPressedRoom, setLongPressedRoom] = useState<string | null>(null);

  /** Load archived room IDs from local storage */
  const loadArchived = async () => {
    try {
      const raw = await AsyncStorage.getItem(ARCHIVED_KEY);
      if (raw) setArchivedIds(new Set(JSON.parse(raw)));
    } catch (_) {}
  };

  const saveArchived = async (ids: Set<string>) => {
    try {
      await AsyncStorage.setItem(ARCHIVED_KEY, JSON.stringify([...ids]));
    } catch (_) {}
  };

  const toggleArchive = async (roomId: string) => {
    setArchivedIds(prev => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId); else next.add(roomId);
      saveArchived(next);
      return next;
    });
    setLongPressedRoom(null);
  };

  const loadData = useCallback(async () => {
    try {
      const [r, p, c] = await Promise.all([
        ChatService.getRooms(),
        ChatService.getPendingContacts(),
        ChatService.getAvailableContacts()
      ]);
      setRooms(Array.isArray(r) ? r : []);
      setPending(Array.isArray(p) ? p : []);
      setContacts(Array.isArray(c) ? c : []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    if (user) { loadData(); loadArchived(); }
    else setLoading(false);
  }, [user, loadData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAcceptRequest = async (id: string, accept: boolean) => {
    try {
      await ChatService.updateContactStatus(id, accept ? 'ACCEPTED' : 'REJECTED');
      await loadData();
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    }
  };

  const handleSendRequest = async () => {
    if (!newEmail.includes('@')) return Alert.alert('Atenção', 'E-mail inválido');
    setSendingRequest(true);
    try {
      await ChatService.requestContact(newEmail);
      Alert.alert('Sucesso', 'Solicitação enviada!');
      setNewEmail('');
      setModalTab('CONTACTS');
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao enviar convite');
    }
    setSendingRequest(false);
  };

  const handleStartChat = async (userId: string) => {
    setModalVisible(false);
    try {
      const room = await ChatService.createRoom({ isGroup: false, userIds: [userId] });
      router.push(`/chat/${room.id}?name=${encodeURIComponent(room.name || 'Chat')}&color=${encodeURIComponent(room.avatarColor || '#2563EB')}` as any);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return Alert.alert('Atenção', 'Digite o nome do grupo');
    if (selectedContacts.length === 0) return Alert.alert('Atenção', 'Selecione participantes');
    try {
      const room = await ChatService.createRoom({ isGroup: true, name: groupName, userIds: selectedContacts });
      setModalVisible(false);
      setGroupName('');
      setSelectedContacts([]);
      router.push(`/chat/${room.id}?name=${encodeURIComponent(room.name || 'Grupo')}&color=${encodeURIComponent(room.avatarColor || '#2563EB')}` as any);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    }
  };

  // ── Filter rooms ──────────────────────────────────────────────────────────
  const filteredRooms = rooms.filter(r => {
    const isArchived = archivedIds.has(r.id);
    if (activeFilter === 'ARCHIVED') return isArchived;
    if (isArchived) return false; // hide archived in other tabs
    if (activeFilter === 'UNREAD') return (r.unreadCount ?? 0) > 0;
    if (activeFilter === 'GROUPS') return r.isGroup;
    return true; // ALL
  });

  const totalUnread = rooms.filter(r => !archivedIds.has(r.id)).reduce((s, r) => s + (r.unreadCount ?? 0), 0);

  // ── Loading / Auth Guards ─────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ color: colors.textSecondary, marginTop: 12, fontWeight: '600' }}>Conectando ao servidor...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }]}>
        <Ionicons name="chatbubbles-outline" size={56} color={colors.textLight} />
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary, marginTop: 20 }}>Chat Corporativo</Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>Crie uma conta para conversar com sua rede e suporte.</Text>
        <TouchableOpacity style={{ backgroundColor: colors.accent, paddingVertical: 14, paddingHorizontal: 36, borderRadius: 14, marginTop: 24 }} onPress={() => router.replace('/auth/login' as any)}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>Criar Conta ou Entrar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderHeader = () => (
    <View style={{ gap: 12, marginBottom: 12 }}>
      {/* Solicitações Pendentes */}
      {pending.map(p => (
        <View key={p.id} style={styles.pendingCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.avatar, { width: 36, height: 36, backgroundColor: '#F59E0B' }]}>
              {p.user?.avatarUrl ? (
                <Image source={{ uri: p.user.avatarUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>{(p.user?.name || p.requesterId || '?')[0]?.toUpperCase()}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#92400E' }}>{p.user?.name || p.requesterId}</Text>
              <Text style={{ fontSize: 11, color: '#B45309', fontWeight: '600' }}>Solicitação de contato</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity style={styles.pendBtnReject} onPress={() => handleAcceptRequest(p.id, false)}>
                <Ionicons name="close" size={16} color="#DC2626" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.pendBtnAccept} onPress={() => handleAcceptRequest(p.id, true)}>
                <Ionicons name="checkmark" size={16} color="#059669" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}
    </View>
  );

  const renderRoom = ({ item }: { item: ChatRoom }) => {
    const isArchived = archivedIds.has(item.id);
    const unread = item.unreadCount ?? 0;
    const isLongPressed = longPressedRoom === item.id;

    return (
      <TouchableOpacity
        style={[styles.roomRow, isLongPressed && { backgroundColor: '#F0F9FF' }]}
        activeOpacity={0.75}
        onPress={() => {
          if (isLongPressed) { setLongPressedRoom(null); return; }
          router.push(`/chat/${item.id}?name=${encodeURIComponent(item.name || 'Chat')}&color=${encodeURIComponent(item.avatarColor || '#2563EB')}&avatarUrl=${encodeURIComponent(item.avatarUrl || '')}` as any);
        }}
        onLongPress={() => setLongPressedRoom(isLongPressed ? null : item.id)}
      >
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: item.avatarColor || '#2563EB' }]}>
          {item.avatarUrl ? (
            <Image source={{ uri: item.avatarUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} />
          ) : item.isGroup ? (
            <Ionicons name="people" size={20} color="#fff" />
          ) : (
            <Text style={styles.avatarText}>
              {(item.name || 'C').split(' ').filter(Boolean).map(w => w[0] || '').slice(0, 2).join('').toUpperCase()}
            </Text>
          )}
        </View>

        {/* Content */}
        <View style={styles.roomContent}>
          <View style={styles.roomTop}>
            <Text style={[styles.roomName, unread > 0 && { fontWeight: '900', color: colors.slate }]}>
              {item.name}
            </Text>
            <Text style={[styles.roomTime, unread > 0 && { color: colors.accent, fontWeight: '800' }]}>
              {timeAgo(item.lastMessageAt)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[styles.roomPreview, unread > 0 && { fontWeight: '700', color: colors.slate }]} numberOfLines={1}>
              {item.lastMessage
                ? `${item.lastSender ? item.lastSender + ': ' : ''}${item.lastMessage}`
                : (item.isGroup ? `${item.memberCount} membros` : 'Nova conversa iniciada')}
            </Text>
            {/* Unread Badge */}
            {unread > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Long-press action: archive */}
        {isLongPressed && (
          <TouchableOpacity
            style={styles.archiveBtn}
            onPress={() => toggleArchive(item.id)}
          >
            <Ionicons name={isArchived ? 'arrow-undo' : 'archive'} size={20} color={isArchived ? '#059669' : '#6366F1'} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.cardWhite }]}>
      {/* Header Fixo */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={styles.headerTitle}>Conversas</Text>
            {totalUnread > 0 && (
              <View style={{ backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, minWidth: 20, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
              </View>
            )}
          </View>
          <Text style={styles.headerSub}>Caixa de entrada corporativa</Text>
        </View>
        <TouchableOpacity style={styles.headerAction} onPress={() => setModalVisible(true)}>
          <Ionicons name="create-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs (WhatsApp-style) */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {FILTERS.map(f => {
            const isActive = activeFilter === f.id;
            const badge = f.id === 'UNREAD'
              ? rooms.filter(r => !archivedIds.has(r.id) && (r.unreadCount ?? 0) > 0).length
              : f.id === 'ARCHIVED'
              ? archivedIds.size
              : 0;
            return (
              <TouchableOpacity
                key={f.id}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveFilter(f.id)}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>{f.label}</Text>
                {badge > 0 && (
                  <View style={[styles.filterBadge, isActive && { backgroundColor: '#fff' }]}>
                    <Text style={[styles.filterBadgeText, isActive && { color: colors.accent }]}>{badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        style={{ backgroundColor: colors.background }}
        data={filteredRooms}
        keyExtractor={r => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={activeFilter === 'ALL' ? renderHeader : undefined}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 76 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name={activeFilter === 'ARCHIVED' ? 'archive-outline' : activeFilter === 'UNREAD' ? 'mail-unread-outline' : 'chatbubbles-outline'}
              size={56}
              color={colors.textLight}
            />
            <Text style={styles.emptyText}>
              {activeFilter === 'ARCHIVED'
                ? 'Nenhuma conversa arquivada.'
                : activeFilter === 'UNREAD'
                ? 'Nenhuma mensagem não lida.'
                : activeFilter === 'GROUPS'
                ? 'Nenhum grupo ainda.'
                : 'Sem mensagens ainda.\nAdicione contatos para começar.'}
            </Text>
          </View>
        }
        renderItem={renderRoom}
      />

      {/* Long-press hint */}
      {longPressedRoom && (
        <View style={styles.hintBar}>
          <Ionicons name="information-circle-outline" size={16} color="#6366F1" />
          <Text style={{ fontSize: 12, color: '#4338CA', fontWeight: '600', marginLeft: 6 }}>
            Toque no ícone de arquivo para arquivar/desarquivar
          </Text>
        </View>
      )}

      {/* MODAL DE NOVO CHAT / GRUPO */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nova Conversa</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                 <Ionicons name="close" size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* TAB SELECTOR */}
            <View style={styles.tabRow}>
              <TouchableOpacity style={[styles.tab, modalTab === 'CONTACTS' && styles.tabActive]} onPress={() => setModalTab('CONTACTS')}>
                <Text style={[styles.tabText, modalTab === 'CONTACTS' && styles.tabTextActive]}>Contatos</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tab, modalTab === 'GROUP' && styles.tabActive]} onPress={() => setModalTab('GROUP')}>
                <Text style={[styles.tabText, modalTab === 'GROUP' && styles.tabTextActive]}>Criar Grupo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tab, modalTab === 'ADD' && styles.tabActive]} onPress={() => setModalTab('ADD')}>
                <Text style={[styles.tabText, modalTab === 'ADD' && styles.tabTextActive]}>Adicionar</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
              
              {/* ABA CONTATOS */}
              {modalTab === 'CONTACTS' && (
                <View>
                  {contacts.length === 0 ? (
                    <Text style={styles.emptyContacts}>Você ainda não possui contatos aprovados ou compartilhamentos de bens ativos.</Text>
                  ) : (
                    contacts.map(c => (
                      <TouchableOpacity key={c.email} style={styles.contactItem} onPress={() => handleStartChat(c.email)}>
                        <View style={[styles.avatar, { width: 36, height: 36, backgroundColor: '#3B82F6' }]}>
                          {c.avatarUrl ? (
                            <Image source={{ uri: c.avatarUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                          ) : (
                            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>{(c.name || c.email || '?')[0]?.toUpperCase()}</Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.contactName}>{c.name || c.email}</Text>
                          <Text style={styles.contactEmail}>{c.email}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}

              {/* ABA CRIAR GRUPO */}
              {modalTab === 'GROUP' && (
                <View style={{ paddingTop: 10 }}>
                  <Text style={styles.inputLabel}>Nome do Grupo</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Ex: Equipe de Manutenção"
                    value={groupName}
                    onChangeText={setGroupName}
                    returnKeyType="done" />
                  <Text style={[styles.inputLabel, { marginTop: 16 }]}>Selecione Membros</Text>
                  {contacts.length === 0 ? (
                    <Text style={styles.emptyContacts}>Nenhum contato disponível.</Text>
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
                            <Text style={styles.contactName}>{c.name || c.email}</Text>
                            <Text style={styles.contactEmail}>{c.email}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateGroup}>
                    <Text style={styles.primaryBtnText}>Criar Grupo ({selectedContacts.length})</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* ABA ADICIONAR EMAIL */}
              {modalTab === 'ADD' && (
                <View style={{ paddingTop: 10 }}>
                  <Text style={styles.inputLabel}>E-mail do Usuário</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="joao@empresa.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={newEmail}
                    onChangeText={setNewEmail}
                    returnKeyType="done" />
                  <Text style={styles.helperText}>Uma solicitação será enviada para o aplicativo deste usuário. Assim que aprovado, ele aparecerá na sua aba de Contatos.</Text>
                  
                  <TouchableOpacity style={[styles.primaryBtn, sendingRequest && { opacity: 0.5 }]} disabled={sendingRequest} onPress={handleSendRequest}>
                    {sendingRequest ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Enviar Convite</Text>}
                  </TouchableOpacity>
                </View>
              )}

            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: colors.cardWhite, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 26, fontWeight: '900', color: colors.slate, letterSpacing: -0.5 },
  headerSub:   { fontSize: 12, color: colors.textSecondary, fontWeight: '600', marginTop: 2 },
  headerAction: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },

  // Filter row
  filterRow: { backgroundColor: colors.cardWhite, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterChipText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  filterChipTextActive: { color: '#fff' },
  filterBadge: { marginLeft: 5, backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, minWidth: 16, alignItems: 'center' },
  filterBadgeText: { fontSize: 10, fontWeight: '900', color: '#fff' },

  pendingCard: {
    marginHorizontal: 16, marginTop: 4,
    backgroundColor: '#FEF3C7', padding: 14, borderRadius: 16,
    borderWidth: 1, borderColor: '#FDE68A'
  },
  pendBtnReject: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
  pendBtnAccept: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#D1FAE5', justifyContent: 'center', alignItems: 'center' },

  list: { paddingBottom: 120 },
  roomRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.cardWhite },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  roomContent: { flex: 1 },
  roomTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  roomName: { fontSize: 15, fontWeight: '700', color: colors.slate, flex: 1, marginRight: 8 },
  roomTime: { fontSize: 11, color: colors.textLight, fontWeight: '600' },
  roomPreview: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', flex: 1, marginRight: 8 },

  // Unread badge
  unreadBadge: {
    backgroundColor: colors.accent, borderRadius: 10,
    minWidth: 20, height: 20, paddingHorizontal: 5,
    justifyContent: 'center', alignItems: 'center',
  },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },

  // Archive button (appears on long press)
  archiveBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center',
    marginLeft: 8,
  },

  // Hint bar
  hintBar: {
    position: 'absolute', bottom: 100, left: 16, right: 16,
    backgroundColor: '#EEF2FF', borderRadius: 12, padding: 12,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#C7D2FE',
  },

  empty: { alignItems: 'center', paddingTop: 60, gap: 14 },
  emptyText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600', textAlign: 'center', lineHeight: 22 },

  // MODAL
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.cardWhite, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: colors.slate, letterSpacing: -0.5 },
  
  tabRow: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: colors.cardWhite, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  tabText: { fontSize: 11, fontWeight: '800', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  tabTextActive: { color: colors.primary },

  emptyContacts: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 20, paddingHorizontal: 20, lineHeight: 20 },
  contactItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.background },
  contactName: { fontSize: 15, fontWeight: '800', color: colors.slate },
  contactEmail: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, marginRight: 14, justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: colors.accent, borderColor: colors.accent },

  inputLabel: { fontSize: 11, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
  textInput: { backgroundColor: colors.background, padding: 14, borderRadius: 12, fontSize: 15, fontWeight: '600', color: colors.slate, borderWidth: 1, borderColor: colors.border },
  helperText: { fontSize: 12, color: colors.textLight, marginTop: 12, lineHeight: 18 },

  primaryBtn: { backgroundColor: colors.accent, padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 24 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' }
});
