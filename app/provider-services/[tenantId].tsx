import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { ColorPalette } from '../../src/theme/colors';
import { fetchPublicProviderDetail } from '../../src/services/directoryCatalog';
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
  featured?: boolean | number | null;
};

function isServiceFeatured(s: CatalogService): boolean {
  const f = s.featured as unknown;
  if (f === true || f === 1) return true;
  if (f === '1' || f === 'true' || f === 'TRUE') return true;
  return false;
}

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
  const [expandedDescriptionIds, setExpandedDescriptionIds] = useState<Set<string>>(() => new Set());
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
      if (hb !== ha) return hb - ha;
      if (a === '__default') return -1;
      if (b === '__default') return 1;
      return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
    });
    return keys;
  }, [grouped]);

  const toggleServiceDescription = (serviceId: string) => {
    setExpandedDescriptionIds((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });
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
            {appTagline ? `${appDisplayName} · ${appTagline}` : appDisplayName}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
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
    imgBox: {
      height: 144,
      borderRadius: 12,
      overflow: 'hidden',
      position: 'relative',
      justifyContent: 'center',
    },
    img: { width: '100%', height: '100%' },
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
    primaryBtn: {
      backgroundColor: C.accent,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    primaryBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
  });
}
