import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ColorPalette,
  MEDIA_TAG_COLORS,
  SERVICE_CATEGORY_COLORS,
} from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { Header } from '../../../src/components/Header';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../../src/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { AgendaService } from '../../../src/services/agendaService';
import { userHasCapability, apiFetch } from '../../../src/services/auth';
import { taskOsLabel } from '../../../src/utils/taskOsLabel';
import { LocationZoneTypeBadge } from '../../../src/components/LocationZoneTypeBadge';

/** Alinhado ao painel / sync: OS fechada na API ou só em cache local. */
const CLOUD_DONE = new Set(['COMPLETED', 'SYNCED', 'DONE', 'CLOSED', 'FINISHED', 'COMPLETE', 'ARCHIVED']);
const CLOUD_CANCELLED = new Set(['CANCELLED', 'CANCELED']);

type CmsApptRow = {
  id: string;
  tenant_id: string;
  reference_code?: string | null;
  status: string;
  scheduled_start_time: string;
  duration_minutes?: number | null;
  service_id?: string | null;
  tenant?: { name?: string | null } | null;
  service?: { name?: string | null } | null;
};

function parseCmsErrorBody(data: unknown, status: number, rawBody: string): string {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (typeof o.error === 'string' && o.error.trim() !== '') {
      return o.error.trim();
    }
    if (typeof o.message === 'string' && o.message.trim() !== '') {
      return o.message.trim();
    }
    const bag = o.errors;
    if (bag && typeof bag === 'object') {
      for (const v of Object.values(bag as Record<string, unknown>)) {
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string' && v[0].trim() !== '') {
          return v[0].trim();
        }
      }
    }
  }
  const t = rawBody.trim();
  if (t.length > 0 && t.length < 800) {
    return t;
  }
  return `HTTP ${status}`;
}

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

function buildStatusMap(C: ColorPalette): Record<string, { labelKey: string; color: string; bg: string; icon: string }> {
  const purple = SERVICE_CATEGORY_COLORS.Reformas;
  return {
    em_andamento: { labelKey: 'orders.inProgress', color: C.status.info.fg, bg: C.status.info.bg, icon: 'time' },
    agendado: { labelKey: 'orders.scheduled', color: purple, bg: `${purple}22`, icon: 'calendar' },
    concluido: { labelKey: 'orders.completed', color: C.status.success.fg, bg: C.status.success.bg, icon: 'checkmark-circle' },
    cancelado: { labelKey: 'orders.cancelled', color: C.destructive, bg: C.status.danger.bg, icon: 'close-circle' },
  };
}

const stylesResModal = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  card: {
    borderTopWidth: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '88%',
  },
  title: { fontSize: 18, fontWeight: '900', marginBottom: 6 },
  chip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    maxWidth: 220,
  },
  btnSecondary: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    alignItems: 'center',
  },
  btnPrimary: { paddingVertical: 14, borderRadius: 12, flex: 1, alignItems: 'center' },
});

export default function OrdersScreen() {
  const { colors: C, resolvedLogoUrl, appDisplayName, appTagline } = useTheme();
  const styles = useMemo(() => createOrdersStyles(C), [C]);
  const statusMap = useMemo(() => buildStatusMap(C), [C]);
  const router = useRouter();
  const { user, userRole } = useAuth();
  const canUseProviderMode = userHasCapability(user, 'mobile.mode.provider');
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState('all');
  const [realTasks, setRealTasks] = useState<any[]>([]);
  const [cmsAppts, setCmsAppts] = useState<CmsApptRow[]>([]);
  const [cmsLoading, setCmsLoading] = useState(true);
  const [cmsError, setCmsError] = useState<string | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<CmsApptRow | null>(null);
  const [rescheduleSlots, setRescheduleSlots] = useState<{ start_time: string; end_time: string }[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleSlotsError, setRescheduleSlotsError] = useState<string | null>(null);
  const [selectedRescheduleIso, setSelectedRescheduleIso] = useState<string | null>(null);
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);

  const loadCmsAppointments = useCallback(async () => {
    if (!user?.email) {
      setCmsLoading(false);
      setCmsAppts([]);
      setCmsError(null);
      return;
    }
    setCmsLoading(true);
    setCmsError(null);
    try {
      const res = await apiFetch('/api/cms/my-appointments');
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = null;
      }
      if (!res.ok) {
        throw new Error(parseCmsErrorBody(parsed, res.status, text));
      }
      const j = (parsed && typeof parsed === 'object' ? parsed : {}) as { data?: CmsApptRow[] };
      setCmsAppts(Array.isArray(j.data) ? j.data : []);
    } catch (e) {
      setCmsError(e instanceof Error ? e.message : String(e));
      setCmsAppts([]);
    } finally {
      setCmsLoading(false);
    }
  }, [user?.email]);

  const cancelCmsAppointment = useCallback(
    (a: CmsApptRow) => {
      Alert.alert(t('orders.cmsCancelTitle'), t('orders.cmsCancelMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('orders.cmsCancelConfirm'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const res = await apiFetch('/api/cms/availability/cancel', {
                  method: 'POST',
                  headers: { 'X-Tenant': a.tenant_id, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ appointment_id: a.id }),
                });
                const text = await res.text();
                let parsed: unknown;
                try {
                  parsed = text ? JSON.parse(text) : {};
                } catch {
                  parsed = null;
                }
                if (!res.ok) {
                  throw new Error(parseCmsErrorBody(parsed, res.status, text));
                }
                await loadCmsAppointments();
                Alert.alert(t('common.ok'), t('orders.cmsCancelDone'));
              } catch (e) {
                Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
              }
            })();
          },
        },
      ]);
    },
    [loadCmsAppointments, t]
  );

  useEffect(() => {
    if (!rescheduleFor) {
      setRescheduleSlots([]);
      setRescheduleSlotsError(null);
      setSelectedRescheduleIso(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setRescheduleSlotsLoading(true);
      setRescheduleSlotsError(null);
      setSelectedRescheduleIso(null);
      try {
        const dur = Number(rescheduleFor.duration_minutes) || 60;
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + 14);
        const qs = new URLSearchParams({
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          duration_minutes: String(dur),
        });
        if (rescheduleFor.service_id) {
          qs.set('service_id', String(rescheduleFor.service_id));
        }
        const res = await apiFetch(`/api/cms/availability/slots?${qs.toString()}`, {
          headers: { 'X-Tenant': rescheduleFor.tenant_id },
        });
        const text = await res.text();
        let parsed: unknown;
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          parsed = null;
        }
        if (!res.ok) {
          throw new Error(parseCmsErrorBody(parsed, res.status, text));
        }
        const j = (parsed && typeof parsed === 'object' ? parsed : {}) as {
          items?: { start_time: string; end_time: string }[];
        };
        if (!cancelled) {
          setRescheduleSlots(Array.isArray(j.items) ? j.items : []);
        }
      } catch (e) {
        if (!cancelled) {
          setRescheduleSlotsError(e instanceof Error ? e.message : String(e));
          setRescheduleSlots([]);
        }
      } finally {
        if (!cancelled) {
          setRescheduleSlotsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rescheduleFor]);

  const confirmReschedule = useCallback(async () => {
    if (!rescheduleFor || !selectedRescheduleIso) {
      return;
    }
    setRescheduleSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/cms/appointments/${encodeURIComponent(rescheduleFor.id)}/reschedule`,
        {
          method: 'POST',
          headers: { 'X-Tenant': rescheduleFor.tenant_id, 'Content-Type': 'application/json' },
          body: JSON.stringify({ start_time: selectedRescheduleIso }),
        }
      );
      const text = await res.text();
      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = null;
      }
      if (!res.ok) {
        throw new Error(parseCmsErrorBody(parsed, res.status, text));
      }
      setRescheduleFor(null);
      await loadCmsAppointments();
      Alert.alert(t('common.ok'), t('orders.cmsRescheduleDone'));
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
    } finally {
      setRescheduleSubmitting(false);
    }
  }, [loadCmsAppointments, rescheduleFor, selectedRescheduleIso, t]);

  useFocusEffect(
    React.useCallback(() => {
      async function fetchTasks() {
        if (!user?.email) return;
        void loadCmsAppointments();
        try {
          const [events, executedRaw] = await Promise.all([
            AgendaService.getUnifiedAgenda(
              user.email,
              canUseProviderMode ? 'PROVIDER' : 'CLIENT',
            ),
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
                color: t.color || MEDIA_TAG_COLORS.DURING,
                refId: t.refId
             };
          });
          setRealTasks(mapped);
        } catch(e) {}
      }
      fetchTasks();
    }, [user, userRole, canUseProviderMode, loadCmsAppointments])
  );

  const orders = React.useMemo(() => realTasks, [realTasks]);
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

  const formatCmsWhen = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(i18n.language?.startsWith('en') ? 'en-US' : 'pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const cmsStatusLabel = (st: string) => {
    const s = (st || '').toLowerCase();
    if (s === 'scheduled') return t('orders.scheduled');
    if (s === 'in_progress') return t('orders.inProgress');
    if (s === 'completed') return t('orders.completed');
    if (s === 'cancelled') return t('orders.cancelled');
    return st || '—';
  };

  const canCancelCms = (a: CmsApptRow) => {
    if ((a.status || '').toLowerCase() !== 'scheduled') return false;
    const t0 = new Date(a.scheduled_start_time).getTime();
    if (Number.isNaN(t0)) return false;
    return t0 > Date.now() - 60_000;
  };

  const formatRescheduleSlot = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(i18n.language?.startsWith('en') ? 'en-US' : 'pt-BR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Ionicons name="receipt-outline" size={56} color={C.textLight} />
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.primary, marginTop: 20 }}>{t('orders.title')}</Text>
          <Text style={{ fontSize: 14, color: C.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>{t('orders.createAccountHint')}</Text>
          <TouchableOpacity style={{ backgroundColor: C.accent, paddingVertical: 14, paddingHorizontal: 36, borderRadius: 14, marginTop: 24 }} onPress={() => router.replace('/auth/login' as any)}>
            <Text style={{ color: C.cardWhite, fontWeight: '900', fontSize: 15 }}>{t('orders.createOrLogin')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.brandHero}>
            {resolvedLogoUrl ? (
              <View style={styles.brandLogoWrap}>
                <Ionicons name="business-outline" size={14} color={C.accent} style={{ marginRight: 6 }} />
                <Text style={styles.brandName}>{appDisplayName}</Text>
              </View>
            ) : null}
            <Text style={styles.brandTagline} numberOfLines={1}>{appTagline}</Text>
          </View>
          <Text style={[styles.title, { color: C.primary }]}>{t('orders.myRequests')}</Text>
          <Text style={styles.subtitle}>{orders.length} {t('orders.ordersCount')}</Text>
        </View>

        <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
          <Text style={{ fontSize: 14, fontWeight: '900', color: C.primary, marginBottom: 8 }}>
            {t('orders.cmsFromDirectory')}
          </Text>
          {cmsError ? (
            <Text style={{ color: C.destructive, fontSize: 12, marginBottom: 6 }} numberOfLines={4}>
              {cmsError}
            </Text>
          ) : null}
          {cmsLoading && cmsAppts.length === 0 && !cmsError ? (
            <ActivityIndicator color={C.accent} style={{ marginVertical: 8 }} />
          ) : null}
          {!cmsError && !cmsLoading && cmsAppts.length === 0 ? (
            <Text style={{ fontSize: 13, color: C.textSecondary }}>{t('orders.cmsEmpty')}</Text>
          ) : null}
          {cmsAppts.map((a) => {
            const st = cmsStatusLabel(a.status);
            return (
              <View key={a.id} style={[styles.orderCard, { marginTop: 8 }]}>
                <View
                  style={[
                    styles.orderIcon,
                    { backgroundColor: `${C.accent}18` },
                  ]}
                >
                  <Ionicons name="calendar-outline" size={22} color={C.accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.orderService} numberOfLines={2}>
                    {a.service?.name || t('orders.cmsServiceTbd')}
                  </Text>
                  <Text style={styles.orderProvider} numberOfLines={1}>
                    {a.tenant?.name || '—'}
                  </Text>
                  {a.reference_code ? (
                    <Text style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>
                      {t('orders.cmsRefLine', { ref: String(a.reference_code) })}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 8 }}>
                    <Text style={styles.orderDate} numberOfLines={1}>
                      {formatCmsWhen(a.scheduled_start_time)}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: C.divider }]}>
                      <Text style={[styles.statusText, { color: C.textSecondary }]} numberOfLines={1}>
                        {st}
                      </Text>
                    </View>
                    {canCancelCms(a) ? (
                      <TouchableOpacity
                        onPress={() => setRescheduleFor(a)}
                        hitSlop={8}
                        accessibilityLabel={t('orders.cmsReschedule')}
                      >
                        <Text style={{ color: C.accent, fontWeight: '800', fontSize: 12 }}>{t('orders.cmsReschedule')}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {canCancelCms(a) ? (
                      <TouchableOpacity
                        onPress={() => cancelCmsAppointment(a)}
                        hitSlop={8}
                        accessibilityLabel={t('orders.cmsCancel')}
                      >
                        <Text style={{ color: C.destructive, fontWeight: '800', fontSize: 12 }}>{t('orders.cmsCancel')}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <Text
          style={{
            fontSize: 14,
            fontWeight: '900',
            color: C.primary,
            paddingHorizontal: 16,
            marginBottom: 8,
          }}
        >
          {t('orders.osAndFieldTasks')}
        </Text>

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
              <Ionicons name="receipt-outline" size={48} color={C.textLight} />
              <Text style={styles.emptyText}>{t('orders.noOrders')}</Text>
              <Text style={styles.emptySub}>{t('orders.noOrdersSub')}</Text>
            </View>
          ) : (
            filteredOrders.map(order => {
              const st = statusMap[order.status] || statusMap.em_andamento;
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
                            backgroundColor: `${order.color || SERVICE_CATEGORY_COLORS.Tecnologia}26`,
                            borderColor: `${order.color || SERVICE_CATEGORY_COLORS.Tecnologia}55`,
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
                  <Ionicons name="chevron-forward" size={18} color={C.textLight} />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <Modal
        visible={!!rescheduleFor}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!rescheduleSubmitting) {
            setRescheduleFor(null);
          }
        }}
      >
        <View style={stylesResModal.root}>
          <Pressable
            style={stylesResModal.backdrop}
            onPress={() => {
              if (!rescheduleSubmitting) {
                setRescheduleFor(null);
              }
            }}
          />
          <View style={[stylesResModal.card, { backgroundColor: C.cardWhite, borderTopColor: C.border }]}>
          <Text style={[stylesResModal.title, { color: C.primary }]}>{t('orders.cmsRescheduleTitle')}</Text>
          {rescheduleFor ? (
            <Text style={{ color: C.textSecondary, fontSize: 12, marginBottom: 8 }} numberOfLines={2}>
              {rescheduleFor.tenant?.name} · {rescheduleFor.service?.name || t('orders.cmsServiceTbd')}
            </Text>
          ) : null}
          {rescheduleSlotsLoading ? (
            <ActivityIndicator color={C.accent} style={{ marginVertical: 12 }} />
          ) : null}
          {rescheduleSlotsError ? (
            <Text style={{ color: C.destructive, fontSize: 12, marginBottom: 8 }}>{rescheduleSlotsError}</Text>
          ) : null}
          {!rescheduleSlotsLoading && !rescheduleSlotsError && rescheduleSlots.length === 0 ? (
            <Text style={{ color: C.textSecondary, fontSize: 13 }}>{t('orders.cmsRescheduleNoSlots')}</Text>
          ) : null}
          <ScrollView
            style={{ maxHeight: 240 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 6 }}
          >
            {rescheduleSlots.map((s) => {
              const active = selectedRescheduleIso === s.start_time;
              return (
                <TouchableOpacity
                  key={s.start_time}
                  onPress={() => setSelectedRescheduleIso(s.start_time)}
                  style={[
                    stylesResModal.chip,
                    {
                      borderColor: active ? C.accent : C.border,
                      backgroundColor: active ? `${C.accent}18` : C.cardWhite,
                    },
                  ]}
                >
                  <Text style={{ color: C.primary, fontWeight: '700', fontSize: 12 }} numberOfLines={2}>
                    {formatRescheduleSlot(s.start_time)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity
              style={[stylesResModal.btnSecondary, { borderColor: C.border }]}
              disabled={rescheduleSubmitting}
              onPress={() => setRescheduleFor(null)}
            >
              <Text style={{ color: C.primary, fontWeight: '800' }}>{t('common.close')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                stylesResModal.btnPrimary,
                { backgroundColor: C.accent, opacity: !selectedRescheduleIso || rescheduleSubmitting ? 0.45 : 1 },
              ]}
              disabled={!selectedRescheduleIso || rescheduleSubmitting}
              onPress={() => void confirmReschedule()}
            >
              <Text style={{ color: '#fff', fontWeight: '900' }}>
                {rescheduleSubmitting ? '…' : t('orders.cmsRescheduleSave')}
              </Text>
            </TouchableOpacity>
          </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createOrdersStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    brandHero: { marginBottom: 10 },
    brandLogoWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    brandName: { fontSize: 12, fontWeight: '900', color: C.accent, textTransform: 'uppercase', letterSpacing: 0.45 },
    brandTagline: { fontSize: 11, fontWeight: '700', color: C.textLight },
    title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
    subtitle: { fontSize: 13, fontWeight: '700', color: C.textSecondary, marginTop: 2 },

    filterRow: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
    filterChip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      backgroundColor: C.divider,
      borderWidth: 1,
      borderColor: C.border,
    },
    filterChipActive: { backgroundColor: C.menuChipActiveBg, borderColor: C.menuChipActiveBg },
    filterText: { fontSize: 13, fontWeight: '700', color: C.textSecondary },
    filterTextActive: { color: C.menuChipActiveFg, fontWeight: '800' },

    orderCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.cardWhite,
      padding: 16,
      borderRadius: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: C.border,
    },
    orderIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    orderOsBadge: {
      flexShrink: 0,
      maxWidth: '100%',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
    },
    orderOsBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.35, color: C.slate },
    orderService: { fontSize: 15, fontWeight: '900', color: C.primary },
    orderProvider: { fontSize: 12, fontWeight: '600', color: C.textSecondary, marginTop: 2 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    statusText: { fontSize: 10, fontWeight: '900' },
    orderDate: { fontSize: 11, fontWeight: '700', color: C.textLight },

    emptyState: { alignItems: 'center', paddingTop: 60 },
    emptyText: { fontSize: 16, fontWeight: '800', color: C.primary, marginTop: 16 },
    emptySub: { fontSize: 13, fontWeight: '600', color: C.textSecondary, marginTop: 4 },
  });
}
