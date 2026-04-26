import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  RefreshControl,
  Keyboard,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useTheme } from '../../src/theme/ThemeContext';
import { ColorPalette } from '../../src/theme/colors';
import { fetchPublicProviderDetail } from '../../src/services/directoryCatalog';
import { apiFetch } from '../../src/services/auth';
import { totalDurationMinutesForCart } from '../../src/services/appointmentAvailability';
import { resolveDirectoryMediaUri } from '../../src/utils/directoryMediaUrl';

type CatalogService = {
  id: string;
  name: string;
  description?: string | null;
  photo_url?: string | null;
  price?: number | null;
  unit?: string | null;
  catalog_group?: string | null;
  duration_minutes?: number | null;
  /** Destaque (CMS): moldura e ordem no catálogo do app */
  featured?: boolean | number | null;
};

function isServiceFeatured(s: CatalogService): boolean {
  const f = s.featured as unknown;
  if (f === true || f === 1) return true;
  if (f === '1' || f === 'true' || f === 'TRUE') return true;
  return false;
}

type CartLine = { service: CatalogService; qty: number };

function resolveImageUrl(raw: string | null | undefined): string | null {
  const u = resolveDirectoryMediaUri(raw);
  return u || null;
}

function formatMoney(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(n);
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

/** Prioridade: `error` (Laravel) → `message` → primeiro de `errors` (validação) → corpo em texto. */
function cmsErrorMessageFromBody(data: unknown, status: number, rawBody: string): string {
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
        if (typeof v === 'string' && v.trim() !== '') {
          return v.trim();
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

export default function ProviderCatalogScreen() {
  const { tenantId } = useLocalSearchParams<{ tenantId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { colors: C, appDisplayName, appTagline } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const locale = i18n.language?.startsWith('en') ? 'en-US' : 'pt-BR';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  /** Horários retornados pelo CMS (capacity); utilizador escolhe um start_time ISO. */
  const [availableSlots, setAvailableSlots] = useState<{ start_time: string; end_time: string }[]>([]);
  const [selectedSlotIso, setSelectedSlotIso] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [bookingRequirePhotos, setBookingRequirePhotos] = useState(false);
  const [bookingRequireGps, setBookingRequireGps] = useState(false);
  const [pendingPhotoUris, setPendingPhotoUris] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /** IDs de serviços com a descrição expandida no card */
  const [expandedDescriptionIds, setExpandedDescriptionIds] = useState<Set<string>>(() => new Set());
  /** Evita refetch ao focar na primeira abertura (o useEffect já carrega). */
  const skipFocusRefetchRef = useRef(true);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!tenantId || typeof tenantId !== 'string') return;
    const silent = Boolean(opts?.silent);
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const d = await fetchPublicProviderDetail(tenantId, { bustCache: silent });
      setDetail(d);
    } catch (e: any) {
      setError(e?.message || 'Erro');
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [tenantId]);

  useEffect(() => {
    skipFocusRefetchRef.current = true;
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (skipFocusRefetchRef.current) {
        skipFocusRefetchRef.current = false;
        return;
      }
      void load({ silent: true });
    }, [load])
  );

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
    const featuredFirst = (a: CatalogService, b: CatalogService) => {
      const fa = isServiceFeatured(a) ? 1 : 0;
      const fb = isServiceFeatured(b) ? 1 : 0;
      if (fb !== fa) return fb - fa;
      return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
    };
    for (const arr of m.values()) {
      arr.sort(featuredFirst);
    }
    return m;
  }, [services]);

  const groupKeys = useMemo(() => {
    const keys = [...grouped.keys()];
    const groupHasFeatured = (k: string) => (grouped.get(k) ?? []).some(isServiceFeatured);
    keys.sort((a, b) => {
      const ha = groupHasFeatured(a) ? 1 : 0;
      const hb = groupHasFeatured(b) ? 1 : 0;
      // Grupos com pelo menos um serviço em destaque sobem no ecrã (evita «destaque» só na última faixa).
      if (hb !== ha) return hb - ha;
      if (a === '__default') return -1;
      if (b === '__default') return 1;
      return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
    });
    return keys;
  }, [grouped]);

  const professionalId = (detail?.representative_professional_id as string) || '';

  const cartTotal = useMemo(
    () => cart.reduce((sum, line) => sum + (Number(line.service.price) || 0) * line.qty, 0),
    [cart]
  );

  const cartItemCount = useMemo(() => cart.reduce((a, l) => a + l.qty, 0), [cart]);

  const cartSlotKey = useMemo(
    () => cart.map((l) => `${l.service.id}:${l.qty}`).join('|'),
    [cart]
  );

  useEffect(() => {
    if (!checkoutOpen || !tenantId || typeof tenantId !== 'string' || cart.length === 0) {
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      setSlotsError(null);
      setSelectedSlotIso(null);
      try {
        const { minutes, serviceId } = totalDurationMinutesForCart(cart);
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + 14);
        const qs = new URLSearchParams({
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          duration_minutes: String(minutes),
        });
        if (serviceId) qs.set('service_id', serviceId);
        const res = await apiFetch(`/api/cms/availability/slots?${qs.toString()}`, {
          headers: { 'X-Tenant': tenantId },
        });
        if (!res.ok) {
          const raw = await res.text();
          throw new Error(raw || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as {
          items?: { start_time: string; end_time: string }[];
          booking_require_photos?: boolean;
          booking_require_gps?: boolean;
        };
        if (cancelled) return;
        setAvailableSlots(Array.isArray(json.items) ? json.items : []);
        setBookingRequirePhotos(!!json.booking_require_photos);
        setBookingRequireGps(!!json.booking_require_gps);
      } catch (e: unknown) {
        if (!cancelled) {
          setSlotsError(e instanceof Error ? e.message : String(e));
          setAvailableSlots([]);
          setBookingRequirePhotos(false);
          setBookingRequireGps(false);
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkoutOpen, tenantId, cartSlotKey, cart.length]);

  const formatSlotLabel = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(locale, {
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

  const canConfirmSchedule = useMemo(
    () =>
      !submitting &&
      !loadingSlots &&
      !slotsError &&
      Boolean(selectedSlotIso) &&
      availableSlots.length > 0 &&
      (!bookingRequirePhotos || pendingPhotoUris.length > 0),
    [
      submitting,
      loadingSlots,
      slotsError,
      selectedSlotIso,
      availableSlots.length,
      bookingRequirePhotos,
      pendingPhotoUris.length,
    ]
  );

  const qtyInCart = useCallback(
    (serviceId: string) => cart.find((l) => l.service.id === serviceId)?.qty ?? 0,
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

  const toggleServiceDescription = (serviceId: string) => {
    setExpandedDescriptionIds((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
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

  const uploadBookingMediaToUrl = useCallback(
    async (localUri: string) => {
      if (!tenantId) throw new Error('tenant');
      const form = new FormData();
      form.append('file', { uri: localUri, name: 'booking.jpg', type: 'image/jpeg' } as any);
      const res = await apiFetch('/api/cms/availability/upload-booking-media', {
        method: 'POST',
        body: form,
        headers: { 'X-Tenant': tenantId },
      });
      if (!res.ok) {
        const raw = await res.text();
        let parsed: unknown;
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch {
          parsed = null;
        }
        throw new Error(cmsErrorMessageFromBody(parsed, res.status, raw));
      }
      const j = (await res.json()) as { url?: string };
      if (!j.url) throw new Error('Upload inválido.');
      return j.url;
    },
    [tenantId]
  );

  const addBookingPhotos = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('common.error'), t('providerCatalog.photoPermDenied'));
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultiple: true,
      quality: 0.75,
    });
    if (r.canceled) return;
    const uris = (r.assets ?? []).map((a) => a.uri).filter(Boolean) as string[];
    if (uris.length === 0) return;
    setPendingPhotoUris((prev) => [...prev, ...uris]);
  }, [t]);

  const submitOrder = async () => {
    if (!tenantId || typeof tenantId !== 'string') return;
    if (cart.length === 0) return;
    if (!selectedSlotIso) {
      Alert.alert('', t('providerCatalog.selectSlot'));
      return;
    }
    if (Date.parse(selectedSlotIso) < Date.now() - 60_000) {
      Alert.alert('', t('providerCatalog.pastTime'));
      return;
    }
    setSubmitting(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (bookingRequireGps) {
        const gperm = await Location.requestForegroundPermissionsAsync();
        if (gperm.status !== 'granted') {
          Alert.alert(t('common.error'), t('providerCatalog.gpsDeniedShort'));
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }

      const mediaItems: { url: string }[] = [];
      if (pendingPhotoUris.length > 0) {
        for (const uri of pendingPhotoUris) {
          const url = await uploadBookingMediaToUrl(uri);
          mediaItems.push({ url });
        }
      } else if (bookingRequirePhotos) {
        Alert.alert(t('common.error'), t('providerCatalog.photoRequired'));
        return;
      }

      const { minutes, serviceId } = totalDurationMinutesForCart(cart);
      const linesText = cart
        .map((l) => `• ${l.service.name} ×${l.qty} (${l.service.id})`)
        .join('\n');
      const descParts = [
        professionalId ? `Ref. profissional: ${professionalId}` : null,
        linesText,
        notes.trim() || null,
      ].filter(Boolean);

      const holdRes = await apiFetch('/api/cms/availability/hold', {
        method: 'POST',
        headers: { 'X-Tenant': tenantId },
        body: JSON.stringify({
          start_time: selectedSlotIso,
          service_id: serviceId ?? null,
          duration_minutes: minutes,
        }),
      });
      const holdText = await holdRes.text();
      let holdParsed: unknown = {};
      try {
        if (holdText) holdParsed = JSON.parse(holdText);
      } catch {
        holdParsed = null;
      }
      if (!holdRes.ok) {
        throw new Error(cmsErrorMessageFromBody(holdParsed, holdRes.status, holdText));
      }
      const holdJson = holdParsed as { hold_id?: string };
      if (!holdJson.hold_id) {
        throw new Error('Resposta de hold inválida.');
      }

      const confRes = await apiFetch('/api/cms/availability/confirm', {
        method: 'POST',
        headers: { 'X-Tenant': tenantId },
        body: JSON.stringify({
          hold_id: holdJson.hold_id,
          client_description: descParts.join('\n\n') || null,
          media: mediaItems.length ? mediaItems : undefined,
          lat,
          lng,
        }),
      });
      const confText = await confRes.text();
      let confParsed: unknown = {};
      try {
        if (confText) confParsed = JSON.parse(confText);
      } catch {
        confParsed = null;
      }
      if (!confRes.ok) {
        throw new Error(cmsErrorMessageFromBody(confParsed, confRes.status, confText));
      }

      const confJson = (confParsed && typeof confParsed === 'object' ? confParsed : {}) as {
        data?: { reference_code?: string };
      };
      const refCode =
        typeof confJson.data?.reference_code === 'string' && confJson.data.reference_code.trim() !== ''
          ? confJson.data.reference_code.trim()
          : null;
      const successMsg = refCode
        ? `${t('providerCatalog.orderSuccessBooked')}\n\n${t('providerCatalog.appointmentRefLine', { ref: refCode })}`
        : t('providerCatalog.orderSuccessBooked');

      Alert.alert(t('common.ok'), successMsg, [
        { text: 'OK', onPress: () => router.back() },
      ]);
      setCart([]);
      setCheckoutOpen(false);
      setSelectedSlotIso(null);
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const companyName = (detail?.name as string) || '';

  const companyLogoUri = useMemo(() => {
    if (!detail) return null;
    const logo =
      typeof detail.logo_url === 'string' && detail.logo_url.trim() !== '' ? detail.logo_url.trim() : null;
    const photo =
      typeof detail.photo === 'string' && detail.photo.trim() !== '' ? detail.photo.trim() : null;
    return resolveImageUrl(logo || photo);
  }, [detail]);

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
        <View style={styles.topBarTitleCluster}>
          {companyLogoUri ? (
            <View style={[styles.companyLogoRing, { backgroundColor: C.divider, borderColor: C.border }]}>
              <Image
                source={{ uri: companyLogoUri }}
                style={styles.companyLogoImg}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                accessibilityLabel={companyName ? `${t('providerCatalog.companyLogoA11y')}: ${companyName}` : t('providerCatalog.companyLogoA11y')}
              />
            </View>
          ) : null}
          <Text style={[styles.screenTitle, { color: C.primary }]} numberOfLines={1}>
            {companyName}
          </Text>
          <Text style={[styles.screenSubTitle, { color: C.textSecondary }]} numberOfLines={1}>
            {appDisplayName} · {appTagline}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load({ silent: true })}
            tintColor={C.accent}
            colors={[C.accent]}
          />
        }
      >
        {groupKeys.map((gk, stripeIndex) => {
          const list = grouped.get(gk) || [];
          if (list.length === 0) return null;
          const label = gk === '__default' ? t('providerCatalog.defaultGroup') : gk;
          return (
            <View
              key={gk}
              style={[styles.categoryStripe, stripeIndex === 0 && styles.categoryStripeFirst]}
            >
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{label}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                {list.map((item) => {
                  const img = resolveImageUrl(item.photo_url);
                  const price = Number(item.price);
                  const hasPrice = Number.isFinite(price) && price > 0;
                  const inCart = qtyInCart(item.id);
                  const descriptionText = (item.description ?? '').trim();
                  const hasDescription = descriptionText.length > 0;
                  const descriptionOpen = expandedDescriptionIds.has(item.id);
                  const featured = isServiceFeatured(item);
                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.card,
                        { backgroundColor: C.cardWhite, borderColor: C.border },
                        featured && styles.cardFeatured,
                        featured && {
                          borderTopColor: C.accent,
                          shadowColor: C.accent,
                        },
                      ]}
                    >
                      <View style={[styles.imgBox, { backgroundColor: C.divider }]}>
                        {img ? (
                          <Image source={{ uri: img }} style={styles.img} resizeMode="cover" />
                        ) : (
                          <Ionicons name="image-outline" size={40} color={C.textLight} style={{ alignSelf: 'center', marginTop: 28 }} />
                        )}
                        <View style={styles.cardQtyBar} pointerEvents="box-none">
                          <TouchableOpacity
                            style={[
                              styles.cardQtyBtn,
                              { backgroundColor: C.cardWhite },
                              inCart <= 0 && styles.cardQtyBtnDisabled,
                            ]}
                            disabled={inCart <= 0}
                            onPress={() => removeFromCart(item.id)}
                            accessibilityLabel={t('providerCatalog.decreaseQty')}
                          >
                            <Ionicons name="remove" size={22} color={C.accent} />
                          </TouchableOpacity>
                          {inCart > 0 ? (
                            <View style={[styles.cardQtyPill, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                              <Text style={styles.cardQtyPillTxt}>{inCart}</Text>
                            </View>
                          ) : (
                            <View style={styles.cardQtySpacer} />
                          )}
                          <TouchableOpacity
                            style={[styles.cardQtyBtn, { backgroundColor: C.cardWhite }]}
                            onPress={() => addToCart(item)}
                            accessibilityLabel={t('providerCatalog.increaseQty')}
                          >
                            <Ionicons name="add" size={22} color={C.accent} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      {featured ? (
                        <Text style={[styles.featuredTag, { color: C.accent }]} accessibilityRole="text">
                          {t('providerCatalog.featuredShort')}
                        </Text>
                      ) : null}
                      <Text style={[styles.price, { color: C.primary }]}>
                        {hasPrice ? formatMoney(price, locale) : t('providerCatalog.priceOnRequest')}
                      </Text>
                      <Text style={[styles.cardTitle, { color: C.primary }]} numberOfLines={2}>
                        {item.name}
                      </Text>
                      {hasDescription ? (
                        <View style={styles.cardDescFooter}>
                          <TouchableOpacity
                            style={[styles.descToggleRow, { borderTopColor: C.border }]}
                            onPress={() => toggleServiceDescription(item.id)}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: descriptionOpen }}
                            accessibilityLabel={
                              descriptionOpen
                                ? t('providerCatalog.descriptionCollapseA11y')
                                : t('providerCatalog.descriptionExpandA11y')
                            }
                          >
                            <Text style={[styles.descToggleLabel, { color: C.accent }]}>
                              {t('providerCatalog.description')}
                            </Text>
                            <Ionicons
                              name={descriptionOpen ? 'chevron-up' : 'chevron-down'}
                              size={18}
                              color={C.accent}
                            />
                          </TouchableOpacity>
                          {descriptionOpen ? (
                            <Text style={[styles.descBody, { color: C.textSecondary }]}>{descriptionText}</Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          );
        })}

        {services.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={styles.muted}>{t('providerCatalog.noServices')}</Text>
          </View>
        ) : null}
      </ScrollView>

      {cart.length > 0 ? (
        <View style={[styles.cartBar, { paddingBottom: insets.bottom + 8, borderTopColor: C.border, backgroundColor: C.cardWhite }]}>
          <TouchableOpacity
            style={styles.cartSummary}
            onPress={() => {
              setPendingPhotoUris([]);
              setCheckoutOpen(true);
            }}
          >
            <View>
              <View style={styles.cartCountRow}>
                <Text style={[styles.cartCountNumber, { color: C.accent }]}>{cartItemCount}</Text>
                <Text style={[styles.cartCountSuffix, { color: C.textSecondary }]}>
                  {cartItemCount === 1
                    ? t('providerCatalog.itemWordSingular')
                    : t('providerCatalog.itemWordPlural')}
                </Text>
              </View>
              <Text style={[styles.cartTotal, { color: C.accent }]}>{formatMoney(cartTotal, locale)}</Text>
            </View>
            <Text style={[styles.cartCta, { color: C.accent }]}>{t('providerCatalog.reviewOrder')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {checkoutOpen ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={StyleSheet.absoluteFillObject}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableOpacity
                style={StyleSheet.absoluteFillObject}
                activeOpacity={1}
                onPress={() => {
                  Keyboard.dismiss();
                  setCheckoutOpen(false);
                }}
              />
              <View style={[styles.modalCard, { backgroundColor: C.cardWhite }]}>
            <Text style={[styles.modalTitle, { color: C.primary }]}>{t('providerCatalog.checkoutTitle')}</Text>
            <ScrollView
              style={{ maxHeight: 160 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
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

            <Text style={[styles.fieldLbl, { color: C.textSecondary }]}>{t('providerCatalog.pickSlot')}</Text>
            {loadingSlots ? (
              <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={C.accent} />
                <Text style={[styles.muted, { marginTop: 6 }]}>{t('providerCatalog.slotsLoading')}</Text>
              </View>
            ) : slotsError ? (
              <Text style={{ color: C.destructive, fontSize: 13 }}>{t('providerCatalog.slotsError')}</Text>
            ) : availableSlots.length === 0 ? (
              <Text style={{ color: C.textSecondary, fontSize: 14 }}>{t('providerCatalog.slotsEmpty')}</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              >
                {availableSlots.map((s) => {
                  const active = selectedSlotIso === s.start_time;
                  return (
                    <TouchableOpacity
                      key={s.start_time}
                      onPress={() => setSelectedSlotIso(s.start_time)}
                      style={[
                        styles.slotChip,
                        {
                          borderColor: active ? C.accent : C.border,
                          backgroundColor: active ? `${C.accent}18` : C.cardWhite,
                        },
                      ]}
                    >
                      <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }} numberOfLines={2}>
                        {formatSlotLabel(s.start_time)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <Text style={[styles.fieldLbl, { color: C.textSecondary }]}>{t('providerCatalog.notes')}</Text>
            <TextInput
              style={[styles.notesIn, { borderColor: C.border, color: C.primary }]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('providerCatalog.notesPh')}
              placeholderTextColor={C.textLight}
              multiline
            />

            {(bookingRequirePhotos || bookingRequireGps) && (
              <View style={{ marginTop: 8, marginBottom: 4 }}>
                {bookingRequireGps ? (
                  <Text style={[styles.muted, { fontSize: 12, marginBottom: bookingRequirePhotos ? 8 : 0 }]}>
                    {t('providerCatalog.bookingGpsHint')}
                  </Text>
                ) : null}
                {bookingRequirePhotos ? (
                  <>
                    <Text style={[styles.fieldLbl, { color: C.textSecondary }]}>{t('providerCatalog.bookingPhotos')}</Text>
                    <Text style={[styles.muted, { fontSize: 12, marginBottom: 8 }]}>
                      {t('providerCatalog.bookingPhotosHint')}
                    </Text>
                    {pendingPhotoUris.length > 0 ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                      >
                        {pendingPhotoUris.map((uri, idx) => (
                          <View key={`${uri}-${idx}`} style={styles.photoThumbWrap}>
                            <Image source={{ uri }} style={styles.photoThumb} />
                            <TouchableOpacity
                              style={styles.photoRemove}
                              onPress={() => setPendingPhotoUris((p) => p.filter((_, i) => i !== idx))}
                              accessibilityLabel={t('providerCatalog.removePhoto')}
                            >
                              <Ionicons name="close-circle" size={22} color="#b91c1c" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </ScrollView>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.secondaryBtn, { marginTop: 6, alignSelf: 'flex-start' }]}
                      onPress={() => void addBookingPhotos()}
                    >
                      <Text style={{ color: C.primary, fontWeight: '700' }}>{t('providerCatalog.addPhotos')}</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity style={[styles.secondaryBtn, { borderColor: C.border }]} onPress={() => setCheckoutOpen(false)}>
                <Text style={{ color: C.primary, fontWeight: '700' }}>{t('providerCatalog.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { flex: 1, opacity: canConfirmSchedule && !submitting ? 1 : 0.45 },
                ]}
                disabled={!canConfirmSchedule}
                onPress={() => void submitOrder()}
                accessibilityState={{ disabled: !canConfirmSchedule }}
              >
                <Text style={styles.primaryBtnTxt}>
                  {submitting ? '…' : t('providerCatalog.confirmSchedule')}
                </Text>
              </TouchableOpacity>
            </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
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
    topBarTitleCluster: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minWidth: 0,
      paddingRight: 4,
    },
    companyLogoRing: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
    },
    companyLogoImg: { width: '100%', height: '100%' },
    screenTitle: { flex: 1, fontSize: 16, fontWeight: '900', textAlign: 'left', minWidth: 0 },
    screenSubTitle: { position: 'absolute', left: 46, right: 0, top: 22, fontSize: 11, fontWeight: '700' },
    /** Uma linha por categoria: título + carrossel horizontal de cards */
    categoryStripe: { marginTop: 22 },
    categoryStripeFirst: { marginTop: 10 },
    sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
    sectionTitle: { fontSize: 16, fontWeight: '900', color: C.primary },
    card: {
      width: 296,
      borderRadius: 14,
      borderWidth: 1,
      padding: 12,
      marginRight: 4,
    },
    /** Serviços marcados como destaque no CMS: faixa superior + leve brilho */
    cardFeatured: {
      borderTopWidth: 5,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.22,
      shadowRadius: 10,
      elevation: 6,
    },
    featuredTag: {
      fontSize: 11,
      fontWeight: '900',
      marginTop: 6,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    // Área da foto: mesma proporção da prévia em `BrsparkWeb/.../ServiceListPage.tsx` (SERVICE_CATALOG_APP_IMAGE_ASPECT).
    imgBox: {
      height: 144,
      borderRadius: 12,
      overflow: 'hidden',
      position: 'relative',
      justifyContent: 'center',
    },
    img: { width: '100%', height: '100%' },
    cardQtyBar: {
      position: 'absolute',
      left: 8,
      right: 8,
      bottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardQtyBtn: {
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
    cardQtyBtnDisabled: {
      opacity: 0.38,
    },
    cardQtyPill: {
      minWidth: 28,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardQtyPillTxt: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '900',
    },
    cardQtySpacer: {
      minWidth: 28,
    },
    price: { fontSize: 15, fontWeight: '900', marginTop: 10 },
    cardTitle: { fontSize: 13, fontWeight: '700', marginTop: 5, minHeight: 45 },
    cardDescFooter: { marginTop: 4 },
    descToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 8,
      marginTop: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    descToggleLabel: { fontSize: 12, fontWeight: '800' },
    descBody: { fontSize: 12, lineHeight: 18, marginTop: 8 },
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
    cartCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 2 },
    cartCountNumber: { fontSize: 26, fontWeight: '900', lineHeight: 30 },
    cartCountSuffix: { fontSize: 14, fontWeight: '700', lineHeight: 22 },
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
    slotChip: {
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      maxWidth: 200,
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
    photoThumbWrap: {
      width: 72,
      height: 72,
      borderRadius: 10,
      overflow: 'hidden',
      position: 'relative',
    },
    photoThumb: { width: '100%', height: '100%' },
    photoRemove: { position: 'absolute', top: 2, right: 2 },
  });
}
