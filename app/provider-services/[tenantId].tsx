import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { ColorPalette } from '../../src/theme/colors';
import { fetchPublicProviderDetail } from '../../src/services/directoryCatalog';
import { apiFetch, API_BASE } from '../../src/services/auth';

type CatalogService = {
  id: string;
  name: string;
  description?: string | null;
  photo_url?: string | null;
  price?: number | null;
  unit?: string | null;
  catalog_group?: string | null;
  duration_minutes?: number | null;
};

type CartLine = { service: CatalogService; qty: number };

function resolveImageUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const base = API_BASE.replace(/\/$/, '');
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return `${base}${path}`;
}

function formatMoney(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(n);
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

export default function ProviderCatalogScreen() {
  const { tenantId } = useLocalSearchParams<{ tenantId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'pt-BR';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [when, setWhen] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2, 0, 0, 0);
    return d;
  });
  const [showPicker, setShowPicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || typeof tenantId !== 'string') return;
    setLoading(true);
    setError(null);
    try {
      const d = await fetchPublicProviderDetail(tenantId);
      setDetail(d);
      const services = (Array.isArray(d.services) ? d.services : []) as CatalogService[];
      const groups = [...new Set(services.map((s) => (s.catalog_group || '').trim() || '__default'))];
      setActiveGroup(groups[0] || '__default');
    } catch (e: any) {
      setError(e?.message || 'Erro');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const services: CatalogService[] = useMemo(() => {
    if (!detail || !Array.isArray(detail.services)) return [];
    return detail.services as CatalogService[];
  }, [detail]);

  const grouped = useMemo(() => {
    const m = new Map<string, CatalogService[]>();
    for (const s of services) {
      const g = (s.catalog_group || '').trim() || '__default';
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(s);
    }
    return m;
  }, [services]);

  const groupKeys = useMemo(() => [...grouped.keys()], [grouped]);

  const professionalId = (detail?.representative_professional_id as string) || '';

  const cartTotal = useMemo(
    () => cart.reduce((sum, line) => sum + (Number(line.service.price) || 0) * line.qty, 0),
    [cart]
  );

  const addToCart = (s: CatalogService) => {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.service.id === s.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [...prev, { service: s, qty: 1 }];
    });
  };

  const removeFromCart = (serviceId: string) => {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.service.id === serviceId);
      if (i < 0) return prev;
      const line = prev[i];
      if (line.qty <= 1) return prev.filter((_, j) => j !== i);
      const next = [...prev];
      next[i] = { ...line, qty: line.qty - 1 };
      return next;
    });
  };

  const submitOrder = async () => {
    if (!professionalId) {
      Alert.alert('', t('providerCatalog.missingProfessional'));
      return;
    }
    if (cart.length === 0) return;
    if (when.getTime() < Date.now()) {
      Alert.alert('', t('providerCatalog.pastTime'));
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        professional_id: professionalId,
        start_time: when.toISOString(),
        notes: notes.trim() || null,
        lines: cart.map((l) => ({ service_id: l.service.id, quantity: l.qty })),
      };
      const res = await apiFetch('/api/bookings/batch', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg = j.message || j.errors || `HTTP ${res.status}`;
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
      Alert.alert(t('common.ok'), t('providerCatalog.orderSuccess'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
      setCart([]);
      setCheckoutOpen(false);
    } catch (e: any) {
      Alert.alert(t('common.error'), String(e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  const companyName = (detail?.name as string) || '';

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 40 }]}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={styles.muted}>{t('providerCatalog.loading')}</Text>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 24, paddingHorizontal: 24 }]}>
        <Text style={styles.errorTitle}>{t('providerCatalog.errorTitle')}</Text>
        <Text style={styles.muted}>{error}</Text>
        <TouchableOpacity style={[styles.primaryBtn, { marginTop: 16 }]} onPress={() => router.back()}>
          <Text style={styles.primaryBtnTxt}>{t('providerCatalog.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor: C.background }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel={t('providerCatalog.back')}>
          <Ionicons name="chevron-back" size={24} color={C.accent} />
        </TouchableOpacity>
        <Text style={[styles.screenTitle, { color: C.primary }]} numberOfLines={1}>
          {companyName}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
        {groupKeys.map((key) => {
          const label = key === '__default' ? t('providerCatalog.defaultGroup') : key;
          const active = activeGroup === key;
          return (
            <TouchableOpacity key={key} onPress={() => setActiveGroup(key)} style={styles.tabItem}>
              <Text style={[styles.tabTxt, active && { color: C.accent, fontWeight: '900' }]}>{label}</Text>
              {active ? <View style={[styles.tabUnderline, { backgroundColor: C.accent }]} /> : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        {(() => {
          const gk = activeGroup && grouped.has(activeGroup) ? activeGroup : groupKeys[0];
          if (!gk) return null;
          const list = grouped.get(gk) || [];
          if (list.length === 0) return null;
          const label = gk === '__default' ? t('providerCatalog.defaultGroup') : gk;
          return (
            <View key={gk} style={{ marginTop: 16 }}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{label}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                {list.map((item) => {
                  const img = resolveImageUrl(item.photo_url);
                  const price = Number(item.price);
                  const hasPrice = Number.isFinite(price) && price > 0;
                  return (
                    <View key={item.id} style={[styles.card, { backgroundColor: C.cardWhite, borderColor: C.border }]}>
                      <View style={[styles.imgBox, { backgroundColor: C.divider }]}>
                        {img ? (
                          <Image source={{ uri: img }} style={styles.img} resizeMode="contain" />
                        ) : (
                          <Ionicons name="image-outline" size={40} color={C.textLight} style={{ alignSelf: 'center', marginTop: 28 }} />
                        )}
                        <TouchableOpacity style={[styles.plusBtn, { backgroundColor: C.cardWhite }]} onPress={() => addToCart(item)}>
                          <Ionicons name="add" size={22} color={C.accent} />
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.price, { color: C.primary }]}>
                        {hasPrice ? formatMoney(price, locale) : t('providerCatalog.priceOnRequest')}
                      </Text>
                      <Text style={[styles.cardTitle, { color: C.primary }]} numberOfLines={2}>
                        {item.name}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          );
        })()}

        {services.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={styles.muted}>{t('providerCatalog.noServices')}</Text>
          </View>
        ) : null}
      </ScrollView>

      {cart.length > 0 ? (
        <View style={[styles.cartBar, { paddingBottom: insets.bottom + 8, borderTopColor: C.border, backgroundColor: C.cardWhite }]}>
          <TouchableOpacity style={styles.cartSummary} onPress={() => setCheckoutOpen(true)}>
            <View>
              <Text style={styles.cartCount}>{t('providerCatalog.items', { count: cart.reduce((a, l) => a + l.qty, 0) })}</Text>
              <Text style={[styles.cartTotal, { color: C.accent }]}>{formatMoney(cartTotal, locale)}</Text>
            </View>
            <Text style={[styles.cartCta, { color: C.accent }]}>{t('providerCatalog.reviewOrder')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {checkoutOpen ? (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: C.cardWhite }]}>
            <Text style={[styles.modalTitle, { color: C.primary }]}>{t('providerCatalog.checkoutTitle')}</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              {cart.map((line) => (
                <View key={line.service.id} style={styles.lineRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: C.primary }} numberOfLines={1}>
                      {line.service.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: C.textSecondary }}>
                      {formatMoney((Number(line.service.price) || 0) * line.qty, locale)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity onPress={() => removeFromCart(line.service.id)}>
                      <Ionicons name="remove-circle-outline" size={26} color={C.accent} />
                    </TouchableOpacity>
                    <Text style={{ fontWeight: '800', color: C.primary }}>{line.qty}</Text>
                    <TouchableOpacity onPress={() => addToCart(line.service)}>
                      <Ionicons name="add-circle-outline" size={26} color={C.accent} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
            <Text style={[styles.totalLbl, { color: C.textSecondary }]}>{t('providerCatalog.total')}</Text>
            <Text style={[styles.totalBig, { color: C.primary }]}>{formatMoney(cartTotal, locale)}</Text>

            <Text style={[styles.fieldLbl, { color: C.textSecondary }]}>{t('providerCatalog.when')}</Text>
            <TouchableOpacity style={[styles.dateBtn, { borderColor: C.border }]} onPress={() => setShowPicker(true)}>
              <Text style={{ color: C.primary, fontWeight: '700' }}>{when.toLocaleString(locale)}</Text>
            </TouchableOpacity>
            {showPicker ? (
              <DateTimePicker
                value={when}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, d) => {
                  if (Platform.OS === 'android') setShowPicker(false);
                  if (d) setWhen(d);
                }}
              />
            ) : null}

            <Text style={[styles.fieldLbl, { color: C.textSecondary }]}>{t('providerCatalog.notes')}</Text>
            <TextInput
              style={[styles.notesIn, { borderColor: C.border, color: C.primary }]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('providerCatalog.notesPh')}
              placeholderTextColor={C.textLight}
              multiline
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={[styles.secondaryBtn, { borderColor: C.border }]} onPress={() => setCheckoutOpen(false)}>
                <Text style={{ color: C.primary, fontWeight: '700' }}>{t('providerCatalog.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { flex: 1, opacity: submitting ? 0.6 : 1 }]}
                disabled={submitting}
                onPress={() => void submitOrder()}
              >
                <Text style={styles.primaryBtnTxt}>{submitting ? '…' : t('providerCatalog.confirmSchedule')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(C: ColorPalette) {
  return StyleSheet.create({
    root: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    muted: { marginTop: 10, color: C.textSecondary, fontSize: 14 },
    errorTitle: { fontSize: 18, fontWeight: '800', color: C.primary },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 8,
      gap: 8,
    },
    iconBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    screenTitle: { flex: 1, fontSize: 16, fontWeight: '900', textAlign: 'center' },
    tabScroll: { maxHeight: 48 },
    tabRow: { paddingHorizontal: 12, gap: 16, alignItems: 'center' },
    tabItem: { paddingVertical: 8, paddingHorizontal: 4 },
    tabTxt: { fontSize: 13, fontWeight: '700', color: C.textSecondary },
    tabUnderline: { height: 3, borderRadius: 2, marginTop: 4 },
    sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
    sectionTitle: { fontSize: 16, fontWeight: '900', color: C.primary },
    card: {
      width: 148,
      borderRadius: 14,
      borderWidth: 1,
      padding: 10,
      marginRight: 4,
    },
    imgBox: {
      height: 120,
      borderRadius: 12,
      overflow: 'hidden',
      position: 'relative',
      justifyContent: 'center',
    },
    img: { width: '100%', height: '100%' },
    plusBtn: {
      position: 'absolute',
      right: 8,
      bottom: 8,
      width: 34,
      height: 34,
      borderRadius: 17,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 3,
    },
    price: { fontSize: 15, fontWeight: '900', marginTop: 8 },
    cardTitle: { fontSize: 13, fontWeight: '700', marginTop: 4, minHeight: 36 },
    cartBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      borderTopWidth: 1,
      paddingHorizontal: 16,
      paddingTop: 10,
    },
    cartSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cartCount: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
    cartTotal: { fontSize: 20, fontWeight: '900' },
    cartCta: { fontSize: 15, fontWeight: '800' },
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      maxHeight: '88%',
    },
    modalTitle: { fontSize: 18, fontWeight: '900', marginBottom: 12 },
    lineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
    totalLbl: { fontSize: 12, marginTop: 8 },
    totalBig: { fontSize: 22, fontWeight: '900', marginBottom: 12 },
    fieldLbl: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
    dateBtn: {
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    notesIn: {
      borderWidth: 1,
      borderRadius: 12,
      minHeight: 64,
      padding: 10,
      textAlignVertical: 'top',
      marginBottom: 8,
    },
    primaryBtn: {
      backgroundColor: C.accent,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
    },
    primaryBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
    secondaryBtn: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: 'center',
    },
  });
}
