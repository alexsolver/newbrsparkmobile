import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  FlatList, Animated, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { NotificationService, AppNotification } from '../../src/services/notifications';
import { colors } from '../../src/theme/colors';
import { useAuth } from '../../src/hooks/useAuth';

const CATEGORY_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  maintenance: { icon: 'build',              color: '#F59E0B', label: 'Manutenção'  },
  expiry:      { icon: 'alarm',              color: '#EF4444', label: 'Vencimento'  },
  sync:        { icon: 'cloud-done',         color: '#10B981', label: 'Sincronismo' },
  alert:       { icon: 'warning',            color: '#F97316', label: 'Alerta'      },
  info:        { icon: 'information-circle', color: '#3B82F6', label: 'Info'        },
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Agora';
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems]         = useState<AppNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]       = useState<string>('all');
  const fadeAnim                  = useRef(new Animated.Value(0)).current;

  const fetchAndReload = useCallback(async () => {
    if (user?.email) {
      await NotificationService.syncRealNotifications(user.email);
    } else {
      reload();
    }
  }, [user]);

  const reload = useCallback(() => {
    setItems(NotificationService.getAll());
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fadeAnim]);

  useEffect(() => {
    fetchAndReload();
    const unsub = NotificationService.subscribe(reload);

    // Inicializa push
    NotificationService.registerForPushNotificationsAsync();

    // Listener de tap em notificação push
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      if (data?.assetId) router.push(`/asset/${data.assetId}` as any);
    });

    return () => { unsub(); sub.remove(); };
  }, [fetchAndReload, reload]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAndReload();
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleMarkRead = (id: string) => NotificationService.markAsRead(id);
  const handleMarkAll  = () => {
    Alert.alert('Marcar Todas', 'Marcar todas as notificações como lidas?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: () => NotificationService.markAllAsRead() },
    ]);
  };

  const testPush = () => {
    NotificationService.addNotification({
      title: '⚡ Teste de Push Corporativo',
      body: 'Sistema BrSpark confirmou o canal de comunicação push ativo.',
      category: 'info',
    });
  };

  const categories = ['all', 'maintenance', 'expiry', 'alert', 'sync', 'info'];
  const filtered = filter === 'all' ? items : items.filter(i => i.category === filter);
  const unread   = items.filter(i => !i.read).length;

  const renderItem = ({ item, index }: { item: AppNotification; index: number }) => {
    const cfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.info;
    return (
      <TouchableOpacity
        style={[styles.card, !item.read && styles.cardUnread]}
        activeOpacity={0.82}
        onPress={() => handleMarkRead(item.id)}
      >
        <View style={[styles.iconWrap, { backgroundColor: cfg.color + '18' }]}>
          <Ionicons name={cfg.icon} size={22} color={cfg.color} />
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.cardBody} numberOfLines={2}>{item.body}</Text>
          <View style={styles.cardMeta}>
            <View style={[styles.categoryChip, { backgroundColor: cfg.color + '18' }]}>
              <Text style={[styles.categoryLabel, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            <Text style={styles.cardTime}>{timeAgo(item.timestamp)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (!user) {
    return (
      <SafeAreaView edges={['left', 'right']} style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }]}>
        <Ionicons name="notifications-outline" size={56} color={colors.textLight} />
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary, marginTop: 20 }}>Avisos</Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>Crie uma conta para receber avisos e alertas importantes.</Text>
        <TouchableOpacity style={{ backgroundColor: colors.accent, paddingVertical: 14, paddingHorizontal: 36, borderRadius: 14, marginTop: 24 }} onPress={() => router.replace('/auth/login' as any)}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>Criar Conta ou Entrar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Central de Avisos</Text>
          <Text style={styles.headerSub}>
            {unread > 0 ? `${unread} não lido${unread > 1 ? 's' : ''}` : 'Tudo em dia ✓'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={testPush}>
            <Ionicons name="paper-plane-outline" size={20} color={colors.accent} />

          </TouchableOpacity>
          {unread > 0 && (
            <TouchableOpacity style={styles.headerBtn} onPress={handleMarkAll}>
              <Ionicons name="checkmark-done" size={22} color="#10B981" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Filtros ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
       keyboardShouldPersistTaps="handled">
        {categories.map(cat => {
          const active = filter === cat;
          const cfg = cat !== 'all' ? CATEGORY_CONFIG[cat] : null;
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilter(cat)}
            >
              {cfg && <Ionicons name={cfg.icon} size={11} color={active ? '#fff' : cfg.color} style={{ marginRight: 4 }} />}
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {cat === 'all' ? 'Todos' : cfg!.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Lista ── */}
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={56} color={colors.textLight} />
              <Text style={styles.emptyText}>Nenhum aviso nesta categoria</Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: colors.cardWhite,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: colors.primary, letterSpacing: -0.4 },
  headerSub:   { fontSize: 11, color: colors.textSecondary, fontWeight: '800', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    backgroundColor: colors.background, padding: 10, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
  },

  filterScroll: { flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.cardWhite },
  filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center', flexDirection: 'row' },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.cardWhite,
    height: 32,
  },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },

  filterText: { fontSize: 9, fontWeight: '900', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  filterTextActive: { color: '#fff' },

  list: { paddingHorizontal: 16, paddingBottom: 32 },

  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.cardWhite, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  cardUnread: {
    borderLeftWidth: 4, borderLeftColor: colors.accent,
    backgroundColor: colors.accent + '08',
  },

  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  cardContent: { flex: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 12, fontWeight: '900', color: colors.primary, flex: 1, marginRight: 6, letterSpacing: -0.2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },

  cardBody: { fontSize: 11, color: colors.textSecondary, lineHeight: 16, marginBottom: 8, fontWeight: '500' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  categoryLabel: { fontSize: 8, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  cardTime: { fontSize: 9, color: colors.textLight, fontWeight: '800', textTransform: 'uppercase' },

  empty: { alignItems: 'center', paddingTop: 80, gap: 16 },
  emptyText: { fontSize: 13, color: colors.textSecondary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
});
