import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl,
  ActivityIndicator, Modal, ScrollView, TextInput, Alert,
  KeyboardAvoidingView, Platform, Image, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChatService, ChatRoom, ChatContact } from '../../../src/services/chat';
import {
  fetchMyOpsChatThreads,
  listPendingGestorOpsThreadIds,
  type OpsChatThreadSummary,
} from '../../../src/services/executionOpsChat';
import { SERVER_COMPLETED_STATUSES } from '../../../src/utils/providerTaskStatus';
import { taskOsLabel } from '../../../src/utils/taskOsLabel';
import { loadRoomListCache, saveRoomListCache } from '../../../src/services/chatOfflineStorage';
import { useConnectivity } from '../../../src/hooks/useConnectivity';
import { ColorPalette, MEDIA_TAG_COLORS, SERVICE_CATEGORY_COLORS } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { useAuth } from '../../../src/hooks/useAuth';
import { usePersona } from '../../../src/context/PersonaContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHAT_UNREAD_CHANGED_EVENT } from '../../../src/lib/chatUnreadEvents';
import { DeviceEventEmitter } from 'react-native';
import { relTimeShort } from '../../../src/i18n/relativeTime';

const ARCHIVED_KEY = '@brspark_archived_rooms';
const ROOM_ARCHIVE_PREFIX = 'room:';
const OPS_ARCHIVE_PREFIX = 'ops:';
const AUTO_ARCHIVE_GENERAL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTO_ARCHIVE_OPS_MS = 7 * 24 * 60 * 60 * 1000;

function roomArchiveKey(roomId: string) {
  return `${ROOM_ARCHIVE_PREFIX}${String(roomId || '').trim()}`;
}

function opsArchiveKey(executionId: string) {
  return `${OPS_ARCHIVE_PREFIX}${String(executionId || '').trim()}`;
}

function isRoomArchived(archivedIds: Set<string>, roomId: string) {
  const id = String(roomId || '').trim();
  return archivedIds.has(id) || archivedIds.has(roomArchiveKey(id));
}

function isOpsArchived(archivedIds: Set<string>, executionId: string) {
  return archivedIds.has(opsArchiveKey(executionId));
}

function removeRoomArchiveEntry(next: Set<string>, roomId: string) {
  const id = String(roomId || '').trim();
  next.delete(id);
  next.delete(roomArchiveKey(id));
}

function sortByLastMessageDesc<T extends { lastMessageAt?: number | string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta =
      typeof a.lastMessageAt === 'number'
        ? a.lastMessageAt
        : a.lastMessageAt
          ? new Date(a.lastMessageAt).getTime()
          : 0;
    const tb =
      typeof b.lastMessageAt === 'number'
        ? b.lastMessageAt
        : b.lastMessageAt
          ? new Date(b.lastMessageAt).getTime()
          : 0;
    return tb - ta;
  });
}

type FilterTab = 'PENDING' | 'OPS' | 'GROUPS' | 'ARCHIVED';

export default function ChatScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const roleUpper = String(user?.role || '').toUpperCase();
  const canCreateChatGroup = ['MANAGER', 'TENANT_ADMIN', 'SAAS_ADMIN'].includes(roleUpper);
  const isBrSparkSaasUser = roleUpper === 'SAAS_ADMIN';
  const { isOnline } = useConnectivity(8000);
  const { colors: C } = useTheme();
  const { activePersona } = usePersona();
  const isClientApp = activePersona === 'client';
  const styles = useMemo(() => createChatStyles(C), [C]);
  const filterTabs = useMemo(() => {
    const all: { id: FilterTab; label: string }[] = [
      { id: 'PENDING', label: t('chat.filterPending') },
      { id: 'OPS', label: t('chat.filterOps') },
      { id: 'GROUPS', label: t('chat.filterGroups') },
      { id: 'ARCHIVED', label: t('chat.filterArchived') },
    ];
    return isClientApp ? all.filter((f) => f.id !== 'OPS') : all;
  }, [isClientApp, t]);

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [opsThreads, setOpsThreads] = useState<OpsChatThreadSummary[]>([]);
  const [pending, setPending] = useState<ChatContact[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('PENDING');
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());
  const [pendingOpsIds, setPendingOpsIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTab, setModalTab] = useState<'GROUP' | 'ADD'>('GROUP');

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
      if (isRoomArchived(next, roomId)) removeRoomArchiveEntry(next, roomId);
      else next.add(roomArchiveKey(roomId));
      saveArchived(next);
      return next;
    });
    setLongPressedRoom(null);
  };

  const loadData = useCallback(async () => {
    if (user?.id) {
      try {
        const cachedRooms = await loadRoomListCache(user.id);
        if (cachedRooms.length) setRooms(cachedRooms);
      } catch {
        /* ignore */
      }
    }
    setLoading(false);
    try {
      const [r, p, c] = await Promise.all([
        ChatService.getRooms(),
        ChatService.getPendingContacts(),
        ChatService.getAvailableContacts(),
      ]);
      const nextRooms = Array.isArray(r) ? r : [];
      const nextPending = Array.isArray(p) ? p : [];
      const nextContacts = Array.isArray(c) ? c : [];
      let nextOpsThreads: OpsChatThreadSummary[] = [];
      let opsPendingSet = new Set<string>();
      if (!isClientApp) {
        const ot = await fetchMyOpsChatThreads().catch(() => [] as OpsChatThreadSummary[]);
        nextOpsThreads = Array.isArray(ot) ? ot : [];
        const opsPending = await listPendingGestorOpsThreadIds(nextOpsThreads);
        opsPendingSet = new Set(opsPending);
      }
      setRooms(nextRooms);
      setPending(nextPending);
      setContacts(nextContacts);
      setOpsThreads(nextOpsThreads);
      setPendingOpsIds(opsPendingSet);
      setArchivedIds((prev) => {
        const next = new Set(prev);
        let changed = false;

        for (const room of nextRooms) {
          const archived = isRoomArchived(next, room.id);
          const hasFreshPending = (room.unreadCount ?? 0) > 0;
          if (hasFreshPending && archived) {
            removeRoomArchiveEntry(next, room.id);
            changed = true;
            continue;
          }
          if (archived || !room.lastMessageAt) continue;
          const age = Date.now() - Number(room.lastMessageAt);
          if (Number.isFinite(age) && age >= AUTO_ARCHIVE_GENERAL_MS) {
            next.add(roomArchiveKey(room.id));
            changed = true;
          }
        }

        for (const row of nextOpsThreads) {
          const archived = isOpsArchived(next, row.executionId);
          const hasFreshPending = opsPendingSet.has(row.executionId);
          if (hasFreshPending && archived) {
            next.delete(opsArchiveKey(row.executionId));
            changed = true;
            continue;
          }
          if (archived || !row.lastMessageAt) continue;
          const ts = new Date(row.lastMessageAt).getTime();
          const age = Date.now() - ts;
          if (Number.isFinite(age) && age >= AUTO_ARCHIVE_OPS_MS) {
            next.add(opsArchiveKey(row.executionId));
            changed = true;
          }
        }

        if (changed) saveArchived(next);
        return changed ? next : prev;
      });
      if (user?.id && Array.isArray(r) && r.length > 0) {
        await saveRoomListCache(user.id, r);
      }
    } catch (e) {
      console.error(e);
    }
  }, [user?.id, isClientApp]);

  useFocusEffect(useCallback(() => {
    setActiveFilter('PENDING');
    if (user) { loadData(); loadArchived(); }
    else setLoading(false);
  }, [user, loadData]));

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener(CHAT_UNREAD_CHANGED_EVENT, () => {
      void loadData().catch(() => {});
    });
    return () => sub.remove();
  }, [loadData]);

  useEffect(() => {
    if (isClientApp && activeFilter === 'OPS') {
      setActiveFilter('PENDING');
    }
  }, [isClientApp, activeFilter]);

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
      Alert.alert(t('common.error'), e.message);
    }
  };

  const handleSendRequest = async () => {
    if (!newEmail.includes('@')) return Alert.alert(t('common.attention'), t('appAlerts.chatTab.invalidEmail'));
    setSendingRequest(true);
    try {
      await ChatService.requestContact(newEmail);
      Alert.alert(t('common.success'), t('appAlerts.chatTab.inviteSent'));
      setNewEmail('');
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || t('appAlerts.chatTab.inviteFail'));
    }
    setSendingRequest(false);
  };

  const handleCreateGroup = async () => {
    if (!canCreateChatGroup) {
      return Alert.alert(t('appAlerts.techReg.permTitle'), t('appAlerts.chatTab.managersOnly'));
    }
    if (!groupName.trim()) return Alert.alert(t('common.attention'), t('appAlerts.chatTab.groupName'));
    if (selectedContacts.length === 0) return Alert.alert(t('common.attention'), t('appAlerts.chatTab.selectParticipants'));
    try {
      const room = await ChatService.createRoom({ isGroup: true, name: groupName, userIds: selectedContacts });
      setModalVisible(false);
      setGroupName('');
      setSelectedContacts([]);
      router.push(`/chat/${room.id}?name=${encodeURIComponent(room.name || 'Grupo')}&color=${encodeURIComponent(room.avatarColor || '#2563EB')}` as any);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    }
  };

  const nonArchivedRooms = useMemo(
    () => rooms.filter((r) => !isRoomArchived(archivedIds, r.id)),
    [rooms, archivedIds],
  );
  const pendingRooms = useMemo(
    () => sortByLastMessageDesc(nonArchivedRooms.filter((r) => (r.unreadCount ?? 0) > 0)),
    [nonArchivedRooms],
  );
  const groupedRooms = useMemo(
    () => sortByLastMessageDesc(nonArchivedRooms.filter((r) => r.isGroup)),
    [nonArchivedRooms],
  );
  const archivedRooms = useMemo(
    () => sortByLastMessageDesc(rooms.filter((r) => isRoomArchived(archivedIds, r.id))),
    [rooms, archivedIds],
  );
  const pendingOpsThreads = useMemo(
    () =>
      sortByLastMessageDesc(
        opsThreads.filter((row) => pendingOpsIds.has(row.executionId) && !isOpsArchived(archivedIds, row.executionId)),
      ),
    [opsThreads, pendingOpsIds, archivedIds],
  );
  const activeOpsThreads = useMemo(
    () =>
      [...opsThreads.filter((row) => !isOpsArchived(archivedIds, row.executionId))].sort((a, b) => {
        const aResolved = SERVER_COMPLETED_STATUSES.has(String(a.executionStatus || '').toUpperCase()) ? 1 : 0;
        const bResolved = SERVER_COMPLETED_STATUSES.has(String(b.executionStatus || '').toUpperCase()) ? 1 : 0;
        if (aResolved !== bResolved) return aResolved - bResolved;
        const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return tb - ta;
      }),
    [opsThreads, archivedIds],
  );
  const archivedOpsThreads = useMemo(
    () => sortByLastMessageDesc(opsThreads.filter((row) => isOpsArchived(archivedIds, row.executionId))),
    [opsThreads, archivedIds],
  );
  const visibleOpsThreads = useMemo(
    () =>
      activeFilter === 'PENDING'
        ? pendingOpsThreads
        : activeFilter === 'OPS'
          ? activeOpsThreads
          : activeFilter === 'ARCHIVED'
            ? archivedOpsThreads
            : [],
    [activeFilter, pendingOpsThreads, activeOpsThreads, archivedOpsThreads],
  );
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredPendingContacts = useMemo(() => {
    if (!normalizedSearch) return pending;
    return pending.filter((p) => {
      const name = String(p.user?.name || '').trim().toLowerCase();
      const requester = String(p.requesterId || '').trim().toLowerCase();
      const email = String(p.user?.email || '').trim().toLowerCase();
      return (
        name.includes(normalizedSearch) ||
        requester.includes(normalizedSearch) ||
        email.includes(normalizedSearch)
      );
    });
  }, [pending, normalizedSearch]);
  const filteredOpsThreads = useMemo(() => {
    if (!normalizedSearch) return visibleOpsThreads;
    return visibleOpsThreads.filter((row) => {
      const label = taskOsLabel({
        id: row.executionId,
        osNumber: row.osNumber,
        routineTaskNumber: row.routineTaskNumber,
      }).toLowerCase();
      const preview = String(row.lastPreview || '').trim().toLowerCase();
      const title = String(row.title || '').trim().toLowerCase();
      return (
        label.includes(normalizedSearch) ||
        preview.includes(normalizedSearch) ||
        title.includes(normalizedSearch) ||
        String(row.executionId || '').toLowerCase().includes(normalizedSearch)
      );
    });
  }, [visibleOpsThreads, normalizedSearch]);
  const filteredRooms = useMemo(() => {
    let base: ChatRoom[] = [];
    if (activeFilter === 'ARCHIVED') base = archivedRooms;
    else if (activeFilter === 'GROUPS') base = groupedRooms;
    else if (activeFilter === 'PENDING') base = pendingRooms;
    if (!normalizedSearch) return base;
    return base.filter((item) => {
      const name = String(item.name || '').toLowerCase();
      const lastMessage = String(item.lastMessage || '').toLowerCase();
      const lastSender = String(item.lastSender || '').toLowerCase();
      return (
        name.includes(normalizedSearch) ||
        lastMessage.includes(normalizedSearch) ||
        lastSender.includes(normalizedSearch)
      );
    });
  }, [activeFilter, archivedRooms, groupedRooms, pendingRooms, normalizedSearch]);

  const totalPending = pendingRooms.length + (isClientApp ? 0 : pendingOpsThreads.length);

  // ── Loading / Auth Guards ─────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.primary} size="large" />
        <Text style={{ color: C.textSecondary, marginTop: 12, fontWeight: '600' }}>{t('chat.connectingServer')}</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }]}>
        <Ionicons name="chatbubbles-outline" size={56} color={C.textLight} />
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.primary, marginTop: 20 }}>{t('chat.guestTitle')}</Text>
        <Text style={{ fontSize: 14, color: C.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>{t('chat.guestBody')}</Text>
        <TouchableOpacity style={{ backgroundColor: C.accent, paddingVertical: 14, paddingHorizontal: 36, borderRadius: 14, marginTop: 24 }} onPress={() => router.replace('/auth/login' as any)}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{t('profile.createOrLogin')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderHeader = () => (
    <View style={{ gap: 12, marginBottom: 12 }}>
      {/* Solicitações Pendentes */}
      {filteredPendingContacts.map(p => (
        <View key={p.id} style={styles.pendingCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.avatar, { width: 36, height: 36, backgroundColor: MEDIA_TAG_COLORS.DURING }]}>
              {p.user?.avatarUrl ? (
                <Image source={{ uri: p.user.avatarUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>{(p.user?.name || p.requesterId || '?')[0]?.toUpperCase()}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: C.status.warning.fg }}>{p.user?.name || p.requesterId}</Text>
              <Text style={{ fontSize: 11, color: C.warning.text, fontWeight: '600' }}>{t('chat.contactRequestLabel')}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity style={styles.pendBtnReject} onPress={() => handleAcceptRequest(p.id, false)}>
                <Ionicons name="close" size={16} color={C.destructive} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.pendBtnAccept} onPress={() => handleAcceptRequest(p.id, true)}>
                <Ionicons name="checkmark" size={16} color={C.success.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ))}
    </View>
  );

  const renderRoom = ({ item }: { item: ChatRoom }) => {
    const isArchived = isRoomArchived(archivedIds, item.id);
    const unread = item.unreadCount ?? 0;
    const isLongPressed = longPressedRoom === item.id;

    return (
      <TouchableOpacity
        style={[styles.roomRow, isLongPressed && { backgroundColor: C.status.info.bg }]}
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
            <Text style={[styles.roomName, unread > 0 && { fontWeight: '900', color: C.slate }]}>
              {item.name}
            </Text>
            <Text style={[styles.roomTime, unread > 0 && { color: C.accent, fontWeight: '800' }]}>
              {relTimeShort(
                typeof item.lastMessageAt === 'number'
                  ? item.lastMessageAt
                  : item.lastMessageAt
                    ? new Date(item.lastMessageAt).getTime()
                    : undefined,
                t,
                i18n.language,
              )}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[styles.roomPreview, unread > 0 && { fontWeight: '700', color: C.slate }]} numberOfLines={1}>
              {item.lastMessage
                ? `${item.lastSender ? item.lastSender + ': ' : ''}${item.lastMessage}`
                : item.isGroup
                  ? t('chat.previewMembers', { count: item.memberCount ?? 0 })
                  : t('chat.previewNewChat')}
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
            <Ionicons name={isArchived ? 'arrow-undo' : 'archive'} size={20} color={isArchived ? C.success.text : SERVICE_CATEGORY_COLORS.Tecnologia} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.cardWhite }]}>
      {/* Header Fixo */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={styles.headerTitle}>{t('chat.title')}</Text>
            {totalPending > 0 && (
              <View style={{ backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, minWidth: 20, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{totalPending > 99 ? '99+' : totalPending}</Text>
              </View>
            )}
          </View>
          <Text style={styles.headerSub}>{t('chat.listSub')}</Text>
        </View>
        <TouchableOpacity
          style={styles.headerAction}
          onPress={() => {
            setModalTab(canCreateChatGroup ? 'GROUP' : 'ADD');
            setModalVisible(true);
          }}
        >
          <Ionicons name="create-outline" size={24} color={C.primary} />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {filterTabs.map(f => {
            const isActive = activeFilter === f.id;
            const badge = f.id === 'PENDING'
              ? totalPending
              : f.id === 'OPS'
              ? activeOpsThreads.length
              : f.id === 'GROUPS'
              ? groupedRooms.length
              : f.id === 'ARCHIVED'
              ? archivedRooms.length + (isClientApp ? 0 : archivedOpsThreads.length)
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
                    <Text style={[styles.filterBadgeText, isActive && { color: C.accent }]}>{badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={C.textLight} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('chat.searchPlaceholder')}
          placeholderTextColor={C.textLight}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchQuery.trim() ? (
          <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityLabel="Limpar busca">
            <Ionicons name="close-circle" size={18} color={C.textLight} />
          </TouchableOpacity>
        ) : null}
      </View>

      {isOnline === false && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={20} color={C.status.warning.fg} />
          <Text style={styles.offlineBannerText}>{t('chat.offlineBanner')}</Text>
        </View>
      )}

      {filteredOpsThreads.length > 0 ? (
        <View style={{ backgroundColor: C.background, paddingTop: 12 }}>
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '900',
                color: C.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: 0.6,
              }}
            >
              {activeFilter === 'PENDING'
                ? t('chat.opsSectionPending')
                : activeFilter === 'ARCHIVED'
                  ? t('chat.opsSectionArchived')
                  : t('chat.opsSectionActive')}
            </Text>
          </View>
          {filteredOpsThreads.map((row) => {
            const label = taskOsLabel({
              id: row.executionId,
              osNumber: row.osNumber,
              routineTaskNumber: row.routineTaskNumber,
            });
            const preview = String(row.lastPreview || '').trim();
            const who =
              String(row.lastSenderKind || '').toUpperCase() === 'GESTOR'
                ? t('chat.opsPreviewGestor')
                : String(row.lastSenderKind || '').toUpperCase() === 'TECH'
                  ? t('chat.opsPreviewYou')
                  : '';
            const ts = row.lastMessageAt ? new Date(row.lastMessageAt).getTime() : undefined;
            const isPending = pendingOpsIds.has(row.executionId);
            const isResolved = SERVER_COMPLETED_STATUSES.has(String(row.executionStatus || '').toUpperCase());
            const stateMeta =
              activeFilter === 'ARCHIVED'
                ? {
                    label: t('chat.opsMetaArchived'),
                    bg: C.background,
                    border: C.border,
                    fg: C.textSecondary,
                  }
                : isResolved
                  ? {
                      label: t('chat.opsMetaResolved'),
                      bg: C.status.success.bg,
                      border: C.status.success.border,
                      fg: C.status.success.fg,
                    }
                : isPending
                  ? {
                      label: t('chat.opsMetaAwaitingYou'),
                      bg: C.status.warning.bg,
                      border: C.status.warning.border,
                      fg: C.status.warning.fg,
                    }
                  : String(row.lastSenderKind || '').toUpperCase() === 'TECH'
                    ? {
                        label: t('chat.opsMetaAwaitingReply'),
                        bg: C.status.info.bg,
                        border: C.status.info.border,
                        fg: C.status.info.fg,
                      }
                    : {
                        label: t('chat.opsMetaInProgress'),
                        bg: C.background,
                        border: C.border,
                        fg: C.textSecondary,
                      };
            return (
              <TouchableOpacity
                key={row.executionId}
                style={styles.roomRow}
                activeOpacity={0.75}
                onPress={() =>
                  router.push({
                    pathname: '/chat/[id]',
                    params: {
                      id: row.executionId,
                      ops: '1',
                      name: t('chat.opsThreadNavTitle', { label }),
                      color: '#1d4ed8',
                    },
                  } as never)
                }
              >
                <View style={[styles.avatar, { backgroundColor: '#1d4ed8' }]}>
                  <Ionicons name="briefcase-outline" size={20} color="#fff" />
                </View>
                <View style={styles.roomContent}>
                  <View style={styles.roomTop}>
                    <Text style={[styles.roomName, isPending && { fontWeight: '900', color: C.slate }]} numberOfLines={1}>
                      {label}
                    </Text>
                    <Text style={[styles.roomTime, isPending && { color: C.accent, fontWeight: '800' }]}>
                      {ts != null && Number.isFinite(ts) ? relTimeShort(ts, t, i18n.language) : ''}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[styles.roomPreview, isPending && { fontWeight: '700', color: C.slate }]} numberOfLines={2}>
                      {row.title ? `${row.title} · ` : ''}
                      {who}
                      {preview || '—'}
                    </Text>
                    <View
                      style={[
                        styles.pendingPill,
                        {
                          backgroundColor: stateMeta.bg,
                          borderColor: stateMeta.border,
                        },
                      ]}
                    >
                      <Text style={[styles.pendingPillText, { color: stateMeta.fg }]}>{stateMeta.label}</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 12 }} />
        </View>
      ) : null}

      <FlatList
        style={{ backgroundColor: C.background }}
        data={filteredRooms}
        keyExtractor={r => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={activeFilter === 'PENDING' ? renderHeader : undefined}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: C.border, marginLeft: 76 }} />}
        ListEmptyComponent={filteredOpsThreads.length > 0 ? null : (
          <View style={styles.empty}>
            <Ionicons
              name={activeFilter === 'ARCHIVED' ? 'archive-outline' : activeFilter === 'PENDING' ? 'mail-unread-outline' : activeFilter === 'OPS' ? 'briefcase-outline' : 'chatbubbles-outline'}
              size={56}
              color={C.textLight}
            />
            <Text style={styles.emptyText}>
              {activeFilter === 'ARCHIVED'
                ? t('chat.emptyArchived')
                : activeFilter === 'PENDING'
                  ? normalizedSearch
                    ? t('chat.emptyPendingSearch')
                    : t('chat.emptyPending')
                  : activeFilter === 'OPS'
                    ? normalizedSearch
                      ? t('chat.emptyOpsSearch')
                      : t('chat.emptyOps')
                    : activeFilter === 'GROUPS'
                      ? normalizedSearch
                        ? t('chat.emptyGroupsSearch')
                        : t('chat.emptyGroups')
                      : t('chat.emptyGeneric')}
            </Text>
          </View>
        )}
        renderItem={renderRoom}
      />

      {/* Long-press hint */}
      {longPressedRoom && (
        <View style={styles.hintBar}>
          <Ionicons name="information-circle-outline" size={16} color={SERVICE_CATEGORY_COLORS.Tecnologia} />
          <Text style={{ fontSize: 12, color: C.status.info.fg, fontWeight: '600', marginLeft: 6 }}>{t('chat.longPressHint')}</Text>
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
                 <Ionicons name="close" size={26} color={C.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* TAB SELECTOR */}
            <View style={styles.tabRow}>
              {canCreateChatGroup ? (
                <TouchableOpacity style={[styles.tab, modalTab === 'GROUP' && styles.tabActive]} onPress={() => setModalTab('GROUP')}>
                  <Text style={[styles.tabText, modalTab === 'GROUP' && styles.tabTextActive]}>Criar Grupo</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={[styles.tab, modalTab === 'ADD' && styles.tabActive]} onPress={() => setModalTab('ADD')}>
                <Text style={[styles.tabText, modalTab === 'ADD' && styles.tabTextActive]}>Adicionar</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">

              {/* ABA CRIAR GRUPO */}
              {modalTab === 'GROUP' && canCreateChatGroup && (
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
                  <Text style={styles.helperText}>
                    {isBrSparkSaasUser
                      ? 'Conta BrSpark (equipe): pode convidar qualquer e-mail de utilizador activo na plataforma. O pedido aparece no app do destinatário; após aceitar, o chat fica disponível.'
                      : 'Uma solicitação será enviada para o aplicativo deste usuário na mesma organização. Assim que aprovado, vocês podem conversar; gestores também podem incluí-lo ao criar um grupo.'}
                  </Text>
                  
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

function createChatStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },

    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 12,
      backgroundColor: C.cardWhite, borderBottomWidth: 1, borderBottomColor: C.border,
    },
    headerTitle: { fontSize: 26, fontWeight: '900', color: C.slate, letterSpacing: -0.5 },
    headerSub: { fontSize: 12, color: C.textSecondary, fontWeight: '600', marginTop: 2 },
    headerAction: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center' },

    filterRow: { backgroundColor: C.cardWhite, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
    filterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.background, borderWidth: 1, borderColor: C.border },
    filterChipActive: { backgroundColor: C.menuChipActiveBg, borderColor: C.menuChipActiveBg },
    filterChipText: { fontSize: 13, fontWeight: '700', color: C.textSecondary },
    filterChipTextActive: { color: C.menuChipActiveFg },
    filterBadge: { marginLeft: 5, backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, minWidth: 16, alignItems: 'center' },
    filterBadgeText: { fontSize: 10, fontWeight: '900', color: '#fff' },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 4,
      paddingHorizontal: 14,
      height: 44,
      borderRadius: 14,
      backgroundColor: C.background,
      borderWidth: 1,
      borderColor: C.border,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: C.slate,
    },

    offlineBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: C.status.warning.bg,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: C.status.warning.border,
    },
    offlineBannerText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
      color: C.status.warning.fg,
      lineHeight: 17,
    },

    pendingCard: {
      marginHorizontal: 16, marginTop: 4,
      backgroundColor: C.status.warning.bg, padding: 14, borderRadius: 16,
      borderWidth: 1, borderColor: C.status.warning.border,
    },
    pendBtnReject: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.status.danger.bg, justifyContent: 'center', alignItems: 'center' },
    pendBtnAccept: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.status.success.bg, justifyContent: 'center', alignItems: 'center' },

    list: { paddingBottom: 120 },
    roomRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: C.cardWhite },
    avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    avatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
    roomContent: { flex: 1 },
    roomTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    roomName: { fontSize: 15, fontWeight: '700', color: C.slate, flex: 1, marginRight: 8 },
    roomTime: { fontSize: 11, color: C.textLight, fontWeight: '600' },
    roomPreview: { fontSize: 13, color: C.textSecondary, fontWeight: '500', flex: 1, marginRight: 8 },
    pendingPill: {
      marginLeft: 8,
      backgroundColor: C.status.warning.bg,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: C.status.warning.border,
      alignSelf: 'flex-start',
    },
    pendingPillText: { fontSize: 10, fontWeight: '900', color: C.status.warning.fg },

    unreadBadge: {
      backgroundColor: C.accent, borderRadius: 10,
      minWidth: 20, height: 20, paddingHorizontal: 5,
      justifyContent: 'center', alignItems: 'center',
    },
    unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },

    archiveBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: C.status.info.bg, justifyContent: 'center', alignItems: 'center',
      marginLeft: 8,
    },

    hintBar: {
      position: 'absolute', bottom: 100, left: 16, right: 16,
      backgroundColor: C.status.info.bg, borderRadius: 12, padding: 12,
      flexDirection: 'row', alignItems: 'center',
      borderWidth: 1, borderColor: C.status.info.border,
    },

    empty: { alignItems: 'center', paddingTop: 60, gap: 14 },
    emptyText: { fontSize: 14, color: C.textSecondary, fontWeight: '600', textAlign: 'center', lineHeight: 22 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: C.cardWhite, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '900', color: C.slate, letterSpacing: -0.5 },

    tabRow: { flexDirection: 'row', backgroundColor: C.background, borderRadius: 12, padding: 4, marginBottom: 20 },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
    tabActive: { backgroundColor: C.cardWhite, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    tabText: { fontSize: 11, fontWeight: '800', color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
    tabTextActive: { color: C.primary },

    emptyContacts: { fontSize: 13, color: C.textSecondary, textAlign: 'center', marginTop: 20, paddingHorizontal: 20, lineHeight: 20 },
    contactItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.background },
    contactName: { fontSize: 15, fontWeight: '800', color: C.slate },
    contactEmail: { fontSize: 12, color: C.textSecondary, fontWeight: '500' },

    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.border, marginRight: 14, justifyContent: 'center', alignItems: 'center' },
    checkboxActive: { backgroundColor: C.accent, borderColor: C.accent },

    inputLabel: { fontSize: 11, fontWeight: '800', color: C.textSecondary, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
    textInput: { backgroundColor: C.background, padding: 14, borderRadius: 12, fontSize: 15, fontWeight: '600', color: C.slate, borderWidth: 1, borderColor: C.border },
    helperText: { fontSize: 12, color: C.textLight, marginTop: 12, lineHeight: 18 },

    primaryBtn: { backgroundColor: C.accent, padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 24 },
    primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  });
}
