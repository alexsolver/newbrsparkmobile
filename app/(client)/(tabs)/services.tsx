import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Linking,
  ScrollView, Image, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ColorPalette,
  MEDIA_TAG_COLORS,
  SERVICE_CATEGORY_COLORS,
} from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';

/** Verde oficial do WhatsApp (marca), fora da paleta semântica */
const BRAND_WHATSAPP = '#25D366';
import { ProviderService } from '../../../src/services/api';
import {
  fetchDirectoryCategoryChips,
  FALLBACK_DIRECTORY_CATEGORY_CHIPS,
  LEGACY_SERVICE_CATEGORY_I18N,
  type DirectoryCategoryChip,
} from '../../../src/services/directoryCategories';
import { resolveDirectoryMediaUri } from '../../../src/utils/directoryMediaUrl';
import { requestForegroundLocationAfterRationale } from '../../../src/lib/jitPermissions';

function providerCategoryLabel(t: TFunction, category: string, chips: DirectoryCategoryChip[]): string {
  const chip = chips.find((c) => c.id === category);
  if (chip?.label) return chip.label;
  const suffix = LEGACY_SERVICE_CATEGORY_I18N[category];
  return suffix ? t(`home.serviceCategories.${suffix}`) : category;
}

function numberLocaleForApp(lang: string): string {
  const l = (lang || '').toLowerCase();
  if (l.startsWith('es')) return 'es-ES';
  if (l.startsWith('en')) return 'en-US';
  return 'pt-BR';
}

function StarRating({ rating, C }: { rating: number; C: ColorPalette }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Ionicons
          key={i}
          name={i <= Math.round(rating) ? 'star' : 'star-outline'}
          size={11}
          color={MEDIA_TAG_COLORS.DURING}
        />
      ))}
      <Text style={{ fontSize: 11, fontWeight: '700', color: C.status.warning.fg, marginLeft: 3 }}>
        {rating.toFixed(1)}
      </Text>
    </View>
  );
}

type ServicesStyles = ReturnType<typeof createServicesStyles>;

function ProviderCard({
  item,
  C,
  styles,
  chips,
  onPressCard,
}: {
  item: any;
  C: ColorPalette;
  styles: ServicesStyles;
  chips: DirectoryCategoryChip[];
  onPressCard: () => void;
}) {
  const { t } = useTranslation();
  const chip = chips.find((c) => c.id === item.category);
  const catColor =
    chip?.color ||
    SERVICE_CATEGORY_COLORS[item.category] ||
    C.accent;
  const tags: string[] = typeof item.tags === 'string'
    ? item.tags.split(',').filter(Boolean)
    : (item.tags || []);

  const handleCall = () => {
    if (!item.phone) return;
    Linking.openURL(`tel:${item.phone.replace(/\D/g, '')}`);
  };

  const handleWhatsApp = () => {
    if (!item.phone) return;
    const num = item.phone.replace(/\D/g, '');
    Linking.openURL(`https://wa.me/55${num}`);
  };

  /** Faixa superior: imagem de capa do CMS (`hero_image_url`); se não houver, usa o logo da marca (`logo_url`). */
  const hasDedicatedHero =
    typeof item.hero_image_url === 'string' && item.hero_image_url.trim() !== '';
  const cardHeroUri = hasDedicatedHero
    ? item.hero_image_url.trim()
    : typeof item.logo_url === 'string' && item.logo_url.trim() !== ''
      ? item.logo_url.trim()
      : null;
  const cardHeroFromLogoOnly = Boolean(cardHeroUri) && !hasDedicatedHero;
  const cardHeroAbsoluteUri = cardHeroUri ? resolveDirectoryMediaUri(cardHeroUri) : '';

  return (
    <TouchableOpacity style={styles.cardOuter} activeOpacity={0.92} onPress={onPressCard} accessibilityRole="button">
      {cardHeroAbsoluteUri ? (
        <Image
          source={{ uri: cardHeroAbsoluteUri }}
          style={styles.cardHero}
          resizeMode={cardHeroFromLogoOnly ? 'contain' : 'cover'}
          accessibilityRole="image"
        />
      ) : null}
      <View style={styles.card}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: catColor + '20' }]}>
        <Ionicons
          name={(chip?.icon || 'construct-outline') as any}
          size={26}
          color={catColor}
        />
      </View>

      <View style={{ flex: 1 }}>
        {/* Nome + verificado */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          {item.verified === 1 && (
            <Ionicons name="checkmark-circle" size={14} color={MEDIA_TAG_COLORS.AFTER} />
          )}
        </View>

        {/* Categoria + cidade */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <View style={[styles.catBadge, { backgroundColor: catColor + '18' }]}>
            <Text style={[styles.catText, { color: catColor }]}>{providerCategoryLabel(t, item.category, chips)}</Text>
          </View>
          {item.city && (
            <Text style={styles.city}>
              <Ionicons name="location-outline" size={10} /> {item.city}
            </Text>
          )}
        </View>

        {/* Rating */}
        <View style={{ marginTop: 6 }}>
          <StarRating rating={item.rating || 0} C={C} />
          <Text style={styles.reviews}>{t('services.reviewCount', { count: item.reviews || 0 })}</Text>
        </View>

        {/* Tags */}
        {tags.length > 0 && (
          <View style={styles.tags}>
            {tags.slice(0, 3).map((tag, i) => (
              <View key={i} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Botões de contato */}
      <View style={styles.actions}>
        {item.phone && (
          <>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCall}>
              <Ionicons name="call-outline" size={18} color={C.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: `${BRAND_WHATSAPP}20` }]}
              onPress={handleWhatsApp}
            >
              <Ionicons name="logo-whatsapp" size={18} color={BRAND_WHATSAPP} />
            </TouchableOpacity>
          </>
        )}
      </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ServicesScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createServicesStyles(C), [C]);
  const numLocale = useMemo(() => numberLocaleForApp(i18n.language), [i18n.language]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing]   = useState(false);
  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage]         = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal]       = useState(0);
  const [fromCache, setFromCache] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [categoryChips, setCategoryChips] = useState<DirectoryCategoryChip[]>(FALLBACK_DIRECTORY_CATEGORY_CHIPS);
  const [geoCity, setGeoCity] = useState('');
  const jitLocationPromptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const chips = await fetchDirectoryCategoryChips();
      if (!cancelled) setCategoryChips(chips);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        if (jitLocationPromptedRef.current) return;
        const fg = await Location.getForegroundPermissionsAsync();
        if (fg.status === Location.PermissionStatus.UNDETERMINED) {
          jitLocationPromptedRef.current = true;
          await requestForegroundLocationAfterRationale(t);
        }
      })();
    }, [t]),
  );

  const doSearch = useCallback(
    async (
      q: string,
      cat: string,
      pg: number,
      append = false,
      isRefresh = false,
      cityFilter?: string,
    ) => {
    const city = cityFilter !== undefined ? cityFilter : geoCity;
    if (pg === 1 && !append) {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
    } else {
      setLoadingMore(true);
    }

    const result = await ProviderService.search({
      q,
      category: cat,
      city,
      page: pg,
      limit: 20,
      forceRefresh: isRefresh,
    });

    setFromCache(result.fromCache);
    setTotal(result.total);
    setTotalPages(result.totalPages);
    setProviders(prev => (pg === 1 && !append) ? result.data : [...prev, ...result.data]);
    setLoading(false);
    setRefreshing(false);
    setLoadingMore(false);
    },
    [geoCity],
  );

  // Debounced search: triggers 400ms after user stops typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      doSearch(search, category, 1);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, category, geoCity, doSearch]);

  // Initial load
  useEffect(() => { doSearch('', '', 1); }, []);

  const onRefresh = () => { setPage(1); doSearch(search, category, 1, false, true); };

  const onEndReached = () => {
    if (loadingMore || page >= totalPages) return;
    const next = page + 1;
    setPage(next);
    doSearch(search, category, next, true);
  };

  const findNearbyProviders = async () => {
    const granted = await requestForegroundLocationAfterRationale(t);
    if (!granted) return;
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const city = (place?.city || place?.subregion || place?.district || '').trim();
      if (!city) {
        Alert.alert('', t('services.nearbyNoCity'));
        return;
      }
      setGeoCity(city);
      setPage(1);
      doSearch(search, category, 1, false, false, city);
    } catch {
      Alert.alert('', t('services.nearbyNoCity'));
    }
  };

  const clearNearbyFilter = () => {
    setGeoCity('');
    setPage(1);
    doSearch(search, category, 1, false, false, '');
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {/* Bloco superior fixo: título, atalhos, busca e categorias (não rolam com os cards) */}
      <View style={{ flexShrink: 0 }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: C.primary }]}>{t('services.title')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.subtitle}>
            {fromCache
              ? t('services.localCacheHint')
              : t('services.companiesCount', { count: total.toLocaleString(numLocale) })}
          </Text>
          {fromCache && (
            <View style={{ backgroundColor: C.status.warning.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: C.status.warning.fg }}>{t('services.offlineBadge')}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
        <TouchableOpacity
          onPress={findNearbyProviders}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: C.cardWhite,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: C.border,
          }}
        >
          <Ionicons name="location-outline" size={20} color={C.accent} />
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: C.primary }}>
            {t('services.nearbyProviders')}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={C.textLight} />
        </TouchableOpacity>
        {geoCity ? (
          <TouchableOpacity onPress={clearNearbyFilter} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: `${C.accent}22`,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 12,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '800', color: C.accent }}>
                {t('services.nearbyChip', { city: geoCity })}
              </Text>
              <Ionicons name="close-circle" size={16} color={C.accent} />
            </View>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Ações Fixas (Top Menu Scrollable) */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}
      >
         <TouchableOpacity style={styles.quickActionCard}>
           <View style={[styles.quickActionIcon, { backgroundColor: C.status.info.bg }]}>
             <Ionicons name="person-add" size={22} color={MEDIA_TAG_COLORS.BEFORE} />
           </View>
           <Text style={styles.quickActionText}>{t('services.quickRefer')}</Text>
         </TouchableOpacity>

         <TouchableOpacity style={styles.quickActionCard}>
           <View style={[styles.quickActionIcon, { backgroundColor: C.status.danger.bg }]}>
             <Ionicons name="document-text" size={22} color={MEDIA_TAG_COLORS.DAMAGE} />
           </View>
           <Text style={styles.quickActionText}>{t('services.quickContracts')}</Text>
         </TouchableOpacity>

         <TouchableOpacity style={styles.quickActionCard}>
           <View style={[styles.quickActionIcon, { backgroundColor: C.status.success.bg }]}>
             <Ionicons name="wallet" size={22} color={C.success.text} />
           </View>
           <Text style={styles.quickActionText}>{t('services.quickPayments')}</Text>
         </TouchableOpacity>

         <TouchableOpacity style={styles.quickActionCard}>
           <View style={[styles.quickActionIcon, { backgroundColor: `${SERVICE_CATEGORY_COLORS.Pintura}22` }]}>
             <Ionicons name="star-half" size={22} color={SERVICE_CATEGORY_COLORS.Pintura} />
           </View>
           <Text style={styles.quickActionText}>{t('services.quickRate')}</Text>
         </TouchableOpacity>

         <TouchableOpacity style={styles.quickActionCard}>
           <View style={[styles.quickActionIcon, { backgroundColor: C.status.warning.bg }]}>
             <Ionicons name="shield-checkmark" size={22} color={C.branding} />
           </View>
           <Text style={styles.quickActionText}>{t('services.quickAccessRules')}</Text>
         </TouchableOpacity>
      </ScrollView>

      {/* Busca */}
      <View style={[styles.searchBar, { backgroundColor: C.cardWhite }]}>
        <Ionicons name="search-outline" size={18} color={C.textLight} />
        <TextInput
          style={[styles.searchInput, { color: C.primary }]}
          placeholder={t('services.searchPlaceholder')}
          placeholderTextColor={C.textLight}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={C.textLight} />
          </TouchableOpacity>
        )}
      </View>

      {/* Categorias */}
      <FlatList
        data={categoryChips}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(c) => c.id || '__all__'}
        style={{ height: 52, flexGrow: 0 }}
        contentContainerStyle={styles.catRow}
        renderItem={({ item: cat }) => (
          <TouchableOpacity
            style={[
              styles.catChip,
              category === cat.id && { backgroundColor: C.menuChipActiveBg, borderColor: C.menuChipActiveBg },
            ]}
            onPress={() => setCategory(category === cat.id ? '' : cat.id)}
          >
            <Ionicons
              name={cat.icon as any}
              size={13}
              color={category === cat.id ? C.menuChipActiveFg : C.textSecondary}
            />
            <Text style={[styles.catChipTxt, category === cat.id && { color: C.menuChipActiveFg }]}>
              {cat.i18nKey ? t(cat.i18nKey) : (cat.label || cat.id)}
            </Text>
          </TouchableOpacity>
        )}
      />
      </View>

      {/* Lista: só esta área rola verticalmente */}
      {loading ? (
        <View style={[styles.center, { flex: 1 }]}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={{ color: C.textSecondary, marginTop: 12 }}>{t('services.searching')}</Text>
        </View>
      ) : (
        <FlatList
          data={providers}
          keyExtractor={p => p.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="business-outline" size={52} color={C.textLight} />
              <Text style={styles.emptyTxt}>
                {search || category ? t('services.emptyFiltered') : t('services.emptyDefault')}
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={C.accent} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <ProviderCard
              item={item}
              C={C}
              styles={styles}
              chips={categoryChips}
              onPressCard={() => router.push(`/provider-services/${item.id}` as any)}
            />
          )}
        />
      )}
    </View>
  );
}

function createServicesStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5, marginBottom: 6 },
    subtitle: { fontSize: 13, fontWeight: '700', color: C.textSecondary, marginTop: 2 },

    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginBottom: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
    },
    searchInput: { flex: 1, fontSize: 14, fontWeight: '600' },

    catRow: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
    catChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: C.menuChipInactiveBg,
      borderWidth: 1,
      borderColor: C.menuChipInactiveBorder,
    },
    catChipTxt: { fontSize: 12, fontWeight: '700', color: C.menuChipInactiveFg },

    cardOuter: {
      marginBottom: 10,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: C.divider,
      backgroundColor: C.cardWhite,
      shadowColor: C.slate,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    cardHero: {
      width: '100%',
      height: 96,
      backgroundColor: C.divider,
    },
    card: {
      flexDirection: 'row',
      padding: 14,
      gap: 12,
    },
    avatar: { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    name: { fontSize: 15, fontWeight: '900', color: C.primary, flex: 1 },
    catBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    catText: { fontSize: 10, fontWeight: '800' },
    city: { fontSize: 10, fontWeight: '600', color: C.textSecondary },
    reviews: { fontSize: 10, fontWeight: '600', color: C.textLight, marginTop: 1 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
    tag: {
      backgroundColor: C.background,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: C.border,
    },
    tagText: { fontSize: 9, fontWeight: '700', color: C.textSecondary },
    actions: { justifyContent: 'flex-start', gap: 6, paddingTop: 2 },
    actionBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: `${C.accent}18`,
      justifyContent: 'center',
      alignItems: 'center',
    },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
    emptyTxt: { fontSize: 15, fontWeight: '700', color: C.textSecondary, marginTop: 12, textAlign: 'center' },

    quickActionCard: { alignItems: 'center', width: 84 },
    quickActionIcon: {
      width: 54,
      height: 54,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 6,
      borderWidth: 1,
      borderColor: C.divider,
    },
    quickActionText: { fontSize: 11, fontWeight: '700', color: C.primary, textAlign: 'center', lineHeight: 14 },
  });
}
