import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { Header } from '../../src/components/Header';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { AgendaService } from '../../src/services/agendaService';
import { taskOsLabel } from '../../src/utils/taskOsLabel';
import { LocationZoneTypeBadge } from '../../src/components/LocationZoneTypeBadge';

/** Alinhado ao painel / sync: OS fechada na API ou só em cache local. */
const CLOUD_DONE = new Set(['COMPLETED', 'SYNCED', 'DONE', 'CLOSED', 'FINISHED', 'COMPLETE', 'ARCHIVED']);
const CLOUD_CANCELLED = new Set(['CANCELLED', 'CANCELED']);

function loadExecutedIdsFromStorage(raw: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(raw)) return out;
  for (const ex of raw) {
    const id = typeof ex === 'string' ? ex : ex?.id;
    if (id != null) out.add(String(id));
  }
  return out;
}

function orderUiStatus(e: any, executedIds: Set<string>): 'em_andamento' | 'agendado' | 'concluido' | 'cancelado' {
  const raw = String(e.status || '').toUpperCase();
  if (CLOUD_DONE.has(raw) || executedIds.has(String(e.id))) return 'concluido';
  if (CLOUD_CANCELLED.has(raw)) return 'cancelado';
  if (raw === 'PENDING' || raw === 'RECEIVED') return 'agendado';
  return 'em_andamento';
}

const MOCK_ORDERS = (t: any) => [
  { id: 'o1', service: t('orders.mock.airSplit'),             status: 'em_andamento', date: '18/03/2026', provider: t('home.mock.coolTech'), color: '#3B82F6' },
  { id: 'o2', service: t('orders.mock.inspection'),           status: 'agendado',     date: '25/03/2026', provider: t('home.mock.engVist'),  color: '#7C3AED' },
  { id: 'o3', service: t('orders.mock.cleaning'),             status: 'concluido',    date: '10/03/2026', provider: t('home.mock.limpClean'),color: '#059669' },
];

const STATUS_MAP: Record<string, { labelKey: string; color: string; bg: string; icon: string }> = {
  em_andamento: { labelKey: 'orders.inProgress', color: '#1D4ED8', bg: '#EFF6FF', icon: 'time' },
  agendado:     { labelKey: 'orders.scheduled',   color: '#7C3AED', bg: '#F5F3FF', icon: 'calendar' },
  concluido:    { labelKey: 'orders.completed',   color: '#059669', bg: '#ECFDF5', icon: 'checkmark-circle' },
  cancelado:    { labelKey: 'orders.cancelled',   color: '#DC2626', bg: '#FEF2F2', icon: 'close-circle' },
};

export default function OrdersScreen() {
  const { colors: C } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [filter, setFilter] = useState('all');
  const [realTasks, setRealTasks] = useState<any[]>([]);

  useFocusEffect(
    React.useCallback(() => {
      async function fetchTasks() {
        if (!user?.email) return;
        try {
          const [events, executedRaw] = await Promise.all([
            AgendaService.getUnifiedAgenda(user.email),
            AsyncStorage.getItem('@brspark_executed_tasks'),
          ]);
          let executedParsed: unknown = [];
          try {
            executedParsed = executedRaw ? JSON.parse(executedRaw) : [];
          } catch {
            executedParsed = [];
          }
          const executedIds = loadExecutedIdsFromStorage(executedParsed);
          const tasks = events.filter(e => e.source === 'CHECKLIST' || e.category === 'TASK');
          const mapped = tasks.map(t => {
             const dt = new Date(t.startDate || Date.now());
             const day = isNaN(dt.getDate()) ? '29' : dt.getDate().toString().padStart(2,'0');
             const month = isNaN(dt.getMonth()) ? '03' : (dt.getMonth() + 1).toString().padStart(2,'0');
             const year = isNaN(dt.getFullYear()) ? '2026' : dt.getFullYear();
             
             return {
                id: String(t.id),
                osNumber: t.osNumber ?? null,
                locationZoneType: t.locationZoneType ?? null,
                service: t.title || 'Serviço',
                status: orderUiStatus(t, executedIds),
                date: `${day}/${month}/${year}`,
                provider: t.ownerEmail || 'BrSpark Cloud',
                color: t.color || '#EAB308',
                refId: t.refId
             };
          });
          setRealTasks(mapped);
        } catch(e) {}
      }
      fetchTasks();
    }, [user])
  );

  const orders = React.useMemo(() => [...realTasks, ...MOCK_ORDERS(t)], [t, realTasks]);
  const orderFilterCounts = React.useMemo(
    () => ({
      all: orders.length,
      em_andamento: orders.filter((o) => o.status === 'em_andamento').length,
      agendado: orders.filter((o) => o.status === 'agendado').length,
      concluido: orders.filter((o) => o.status === 'concluido').length,
    }),
    [orders]
  );
  const filteredOrders = filter === 'all' 
    ? orders 
    : orders.filter(o => o.status === filter);

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Ionicons name="receipt-outline" size={56} color={colors.textLight} />
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary, marginTop: 20 }}>{t('orders.title')}</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>{t('orders.createAccountHint')}</Text>
          <TouchableOpacity style={{ backgroundColor: colors.accent, paddingVertical: 14, paddingHorizontal: 36, borderRadius: 14, marginTop: 24 }} onPress={() => router.replace('/auth/login' as any)}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{t('orders.createOrLogin')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[styles.title, { color: C.primary }]}>{t('orders.myRequests')}</Text>
          <Text style={styles.subtitle}>{orders.length} {t('orders.ordersCount')}</Text>
        </View>

        {/* Filtros */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} keyboardShouldPersistTaps="handled">
          {([
            { id: 'all' as const, label: t('common.all') },
            { id: 'em_andamento' as const, label: t('orders.inProgress') },
            { id: 'agendado' as const, label: t('orders.scheduledPlural') },
            { id: 'concluido' as const, label: t('orders.completedPlural') },
          ] as const).map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
              onPress={() => setFilter(f.id)}
            >
              <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>
                {f.label}
                <Text style={{ fontWeight: '900', opacity: filter === f.id ? 0.95 : 0.88 }}>
                  {` (${orderFilterCounts[f.id]})`}
                </Text>
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Lista de Pedidos */}
        <View style={{ paddingHorizontal: 16 }}>
          {filteredOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyText}>{t('orders.noOrders')}</Text>
              <Text style={styles.emptySub}>{t('orders.noOrdersSub')}</Text>
            </View>
          ) : (
            filteredOrders.map(order => {
              const st = STATUS_MAP[order.status] || STATUS_MAP.em_andamento;
              return (
                <TouchableOpacity 
                  key={order.id} 
                  style={styles.orderCard} 
                  activeOpacity={0.8}
                  onPress={() => {
                     if (order.refId) {
                        router.push({
                          pathname: '/checklist/[id]',
                          params: { id: String(order.refId), taskId: String(order.id) },
                        } as any);
                     }
                  }}
                >
                  <View style={[styles.orderIcon, { backgroundColor: order.color + '15' }]}>
                    <Ionicons name="construct" size={22} color={order.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      <View
                        style={[
                          styles.orderOsBadge,
                          {
                            backgroundColor: `${order.color || '#6366F1'}26`,
                            borderColor: `${order.color || '#6366F1'}55`,
                          },
                        ]}
                      >
                        <Text style={styles.orderOsBadgeText}>
                          {taskOsLabel({ id: order.id, osNumber: order.osNumber ?? null })}
                        </Text>
                      </View>
                      <LocationZoneTypeBadge zoneType={(order as { locationZoneType?: string | null }).locationZoneType} />
                    </View>
                    <Text style={styles.orderService}>{order.service}</Text>
                    <Text style={styles.orderProvider}>{order.provider}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 12 }}>
                      <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                        <Ionicons name={st.icon as any} size={12} color={st.color} style={{ marginRight: 4 }} />
                        <Text style={[styles.statusText, { color: st.color }]}>{t(st.labelKey)}</Text>
                      </View>
                      <Text style={styles.orderDate}>{order.date}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: 2 },

  filterRow: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  filterTextActive: { color: '#fff', fontWeight: '800' },

  orderCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  orderIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  orderOsBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  orderOsBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.35, color: '#0F172A' },
  orderService: { fontSize: 15, fontWeight: '900', color: colors.primary },
  orderProvider: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: '900' },
  orderDate: { fontSize: 11, fontWeight: '700', color: colors.textLight },

  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '800', color: colors.primary, marginTop: 16 },
  emptySub: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: 4 },
});
