import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChatService, ChatRoom } from '../../src/services/chat';
import { colors } from '../../src/theme/colors';

function timeAgo(ts?: number) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Agora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function ChatScreen() {
  const router = useRouter();
  const [rooms,      setRooms]      = useState<ChatRoom[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const CONTACTS = [
    { id: 'sup', name: 'Suporte Brspark', role: 'Central de Engenharia', color: '#7C3AED' },
    { id: 'man', name: 'Gestor de Manutenção', role: 'Logística', color: '#10B981' },
    { id: 'adm', name: 'Administração', role: 'Faturamento', color: '#3B82F6' },
  ];

  const loadRooms = useCallback(async () => {
    const data = await ChatService.getRooms();
    setRooms(data);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadRooms(); }, [loadRooms]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRooms();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ color: colors.textSecondary, marginTop: 12, fontWeight: '600' }}>Conectando ao servidor...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Mensagens</Text>
          <Text style={styles.headerSub}>{rooms.length} canais corporativos</Text>
        </View>
        <TouchableOpacity style={styles.headerAction} onPress={() => setModalVisible(true)}>
          <Ionicons name="create-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={rooms}
        keyExtractor={r => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border, marginLeft: 76 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={56} color={colors.textLight} />
            <Text style={styles.emptyText}>Sem canais disponíveis{'\n'}Verifique a conexão com o servidor</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.roomRow}
            activeOpacity={0.75}
            onPress={() => router.push(`/chat/${item.id}?name=${encodeURIComponent(item.name)}&color=${encodeURIComponent(item.avatarColor)}` as any)}
          >
            {/* Avatar */}
            <View style={[styles.avatar, { backgroundColor: item.avatarColor }]}>
              <Text style={styles.avatarText}>
                {item.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
              </Text>
            </View>

            {/* Content */}
            <View style={styles.roomContent}>
              <View style={styles.roomTop}>
                <Text style={styles.roomName}>{item.name}</Text>
                {item.lastMessageAt ? (
                  <Text style={styles.roomTime}>{timeAgo(item.lastMessageAt)}</Text>
                ) : null}
              </View>
              <Text style={styles.roomPreview} numberOfLines={1}>
                {item.lastMessage
                  ? `${item.lastSender ? item.lastSender + ': ' : ''}${item.lastMessage}`
                  : item.description || 'Sem mensagens ainda'}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
          </TouchableOpacity>
        )}
      />
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar Destinatário</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                 <Ionicons name="close" size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {CONTACTS.map(c => (
                <TouchableOpacity 
                   key={c.id} 
                   style={styles.contactRow}
                   onPress={() => {
                     setModalVisible(false);
                     router.push(`/chat/${c.id}?name=${encodeURIComponent(c.name)}&color=${encodeURIComponent(c.color)}` as any);
                   }}
                >
                  <View style={[styles.miniAvatar, { backgroundColor: c.color }]}>
                     <Text style={styles.avatarTextSmall}>{c.name[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                     <Text style={styles.contactName}>{c.name}</Text>
                     <Text style={styles.contactSub}>{c.role}</Text>
                  </View>
                  <Ionicons name="paper-plane-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: colors.cardWhite, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.primary },
  headerSub:   { fontSize: 13, color: colors.textSecondary, fontWeight: '600', marginTop: 2 },
  headerAction: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.cardWhite, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: colors.primary },
  
  contactRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  miniAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarTextSmall: { color: '#fff', fontSize: 14, fontWeight: '800' },
  contactName: { fontSize: 15, fontWeight: '800', color: colors.primary },
  contactSub: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },

  list: { paddingBottom: 40 },
  roomRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.cardWhite },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  roomContent: { flex: 1 },
  roomTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  roomName: { fontSize: 15, fontWeight: '800', color: colors.primary },
  roomTime: { fontSize: 11, color: colors.textLight, fontWeight: '600' },
  roomPreview: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },

  empty: { alignItems: 'center', paddingTop: 100, gap: 14 },
  emptyText: { fontSize: 15, color: colors.textSecondary, fontWeight: '600', textAlign: 'center', lineHeight: 22 },
});
