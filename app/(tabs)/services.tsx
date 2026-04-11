import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Linking,
  ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ColorPalette,
  MEDIA_TAG_COLORS,
  SERVICE_CATEGORY_COLORS,
} from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';

/** Verde oficial do WhatsApp (marca), fora da paleta semântica */
const BRAND_WHATSAPP = '#25D366';
import { ProviderService } from '../../src/services/api';

/** Valor `category` vindo da API (pt-BR) → sufixo de `home.serviceCategories.*` */
const CATEGORY_I18N_KEY: Record<string, string> = {
  Elétrica: 'electrical',
  Hidráulica: 'plumbing',
  Limpeza: 'cleaning',
  Reformas: 'renovation',
  Jardinagem: 'garden',
  Segurança: 'security',
  Climatização: 'climatization',
  Tecnologia: 'technology',
  Dedetização: 'pestControl',
  Mudança: 'moving',
  Gás: 'gas',
  Pintura: 'painting',
};

function providerCategoryLabel(t: TFunction, category: string): string {
  const suffix = CATEGORY_I18N_KEY[category];
  return suffix ? t(`home.serviceCategories.${suffix}`) : category;
}

function numberLocaleForApp(lang: string): string {
  const l = (lang || '').toLowerCase();
  if (l.startsWith('es')) return 'es-ES';
  if (l.startsWith('en')) return 'en-US';
  return 'pt-BR';
}

// ── Chips de categoria (id = valor enviado à API) ─────────────────────────────
const CATEGORY_CHIPS: { id: string; i18nKey: string; icon: string }[] = [
  { id: '', i18nKey: 'common.all', icon: 'grid-outline' },
  { id: 'Elétrica', i18nKey: 'home.serviceCategories.electrical', icon: 'flash-outline' },
  { id: 'Hidráulica', i18nKey: 'home.serviceCategories.plumbing', icon: 'water-outline' },
  { id: 'Limpeza', i18nKey: 'home.serviceCategories.cleaning', icon: 'sparkles-outline' },
  { id: 'Reformas', i18nKey: 'home.serviceCategories.renovation', icon: 'hammer-outline' },
  { id: 'Jardinagem', i18nKey: 'home.serviceCategories.garden', icon: 'leaf-outline' },
  { id: 'Segurança', i18nKey: 'home.serviceCategories.security', icon: 'shield-checkmark-outline' },
  { id: 'Climatização', i18nKey: 'home.serviceCategories.climatization', icon: 'thermometer-outline' },
  { id: 'Tecnologia', i18nKey: 'home.serviceCategories.technology', icon: 'laptop-outline' },
  { id: 'Dedetização', i18nKey: 'home.serviceCategories.pestControl', icon: 'bug-outline' },
  { id: 'Mudança', i18nKey: 'home.serviceCategories.moving', icon: 'cube-outline' },
  { id: 'Gás', i18nKey: 'home.serviceCategories.gas', icon: 'flame-outline' },
  { id: 'Pintura', i18nKey: 'home.serviceCategories.painting', icon: 'color-palette-outline' },
];

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

function ProviderCard({ item, C, styles }: { item: any; C: ColorPalette; styles: ServicesStyles }) {
  const { t } = useTranslation();
  const catColor = SERVICE_CATEGORY_COLORS[item.category] || C.accent;
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

  return (
    <View style={styles.cardOuter}>
      {item.hero_image_url ? (
        <Image
          source={{ uri: item.hero_image_url }}
          style={styles.cardHero}
          resizeMode="cover"
          accessibilityRole="image"
        />
      ) : null}
      <View style={styles.card}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: catColor + '20' }]}>
        <Ionicons
          name={(CATEGORY_CHIPS.find(c => c.id === item.category)?.icon || 'construct-outline') as any}
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
            <Text style={[styles.catText, { color: catColor }]}>{providerCategoryLabel(t, item.category)}</Text>
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
    </View>
  );
}

export default function ServicesScreen() {
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

  const doSearch = useCallback(async (q: string, cat: string, pg: number, append = false, isRefresh = false) => {
    if (pg === 1 && !append) {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
    } else {
      setLoadingMore(true);
    }

    const result = await ProviderService.search({ q, category: cat, page: pg, limit: 20 });

    setFromCache(result.fromCache);
    setTotal(result.total);
    setTotalPages(result.totalPages);
    setProviders(prev => (pg === 1 && !append) ? result.data : [...prev, ...result.data]);
    setLoading(false);
    setRefreshing(false);
    setLoadingMore(false);
  }, []);

  // Debounced search: triggers 400ms after user stops typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      doSearch(search, category, 1);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, category]);

  // Initial load
  useEffect(() => { doSearch('', '', 1); }, []);

  const onRefresh = () => { setPage(1); doSearch(search, category, 1, false, true); };

  const onEndReached = () => {
    if (loadingMore || page >= totalPages) return;
    const next = page + 1;
    setPage(next);
    doSearch(search, category, next, true);
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
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
        data={CATEGORY_CHIPS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.catRow}
        renderItem={({ item: cat }) => (
          <TouchableOpacity
            style={[
              styles.catChip,
              category === cat.id && { backgroundColor: C.accent, borderColor: C.accent },
            ]}
            onPress={() => setCategory(category === cat.id ? '' : cat.id)}
          >
            <Ionicons
              name={cat.icon as any}
              size={13}
              color={category === cat.id ? C.cardWhite : C.textSecondary}
            />
            <Text style={[styles.catChipTxt, category === cat.id && { color: C.cardWhite }]}>
              {t(cat.i18nKey)}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Lista */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={{ color: C.textSecondary, marginTop: 12 }}>{t('services.searching')}</Text>
        </View>
      ) : (
        <FlatList
          data={providers}
          keyExtractor={p => p.id}
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
          renderItem={({ item }) => <ProviderCard item={item} C={C} styles={styles} />}
        />
      )}
    </View>
  );
}

function createServicesStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
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
      backgroundColor: C.divider,
      borderWidth: 1,
      borderColor: C.border,
    },
    catChipTxt: { fontSize: 12, fontWeight: '700', color: C.textSecondary },

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
