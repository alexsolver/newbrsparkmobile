import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl, Linking,
  KeyboardAvoidingView, Platform, ScrollView} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ColorPalette,
  MEDIA_TAG_COLORS,
  SERVICE_CATEGORY_COLORS,
} from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';

/** Verde oficial do WhatsApp (marca), fora da paleta semântica */
const BRAND_WHATSAPP = '#25D366';
import { ProviderService } from '../../src/services/api';

// ── Categoria chips ────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: '', label: 'Todos', icon: 'grid-outline' },
  { id: 'Elétrica', label: 'Elétrica', icon: 'flash-outline' },
  { id: 'Hidráulica', label: 'Hidráulica', icon: 'water-outline' },
  { id: 'Limpeza', label: 'Limpeza', icon: 'sparkles-outline' },
  { id: 'Reformas', label: 'Reformas', icon: 'hammer-outline' },
  { id: 'Jardinagem', label: 'Jardinagem', icon: 'leaf-outline' },
  { id: 'Segurança', label: 'Segurança', icon: 'shield-checkmark-outline' },
  { id: 'Climatização', label: 'Climatização', icon: 'thermometer-outline' },
  { id: 'Tecnologia', label: 'Tecnologia', icon: 'laptop-outline' },
  { id: 'Dedetização', label: 'Dedetização', icon: 'bug-outline' },
  { id: 'Mudança', label: 'Mudança', icon: 'cube-outline' },
  { id: 'Gás', label: 'Gás', icon: 'flame-outline' },
  { id: 'Pintura', label: 'Pintura', icon: 'color-palette-outline' },
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
    <View style={styles.card}>
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: catColor + '20' }]}>
        <Ionicons
          name={(CATEGORIES.find(c => c.id === item.category)?.icon || 'construct-outline') as any}
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
            <Text style={[styles.catText, { color: catColor }]}>{item.category}</Text>
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
          <Text style={styles.reviews}>{item.reviews || 0} avaliações</Text>
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
  );
}

export default function ServicesScreen() {
  const { colors: C } = useTheme();
  const styles = useMemo(() => createServicesStyles(C), [C]);
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
        <Text style={[styles.title, { color: C.primary }]}>Prestadores</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.subtitle}>
            {fromCache ? '📵 cache local' : `${total.toLocaleString('pt-BR')} profissionais`}
          </Text>
          {fromCache && (
            <View style={{ backgroundColor: C.status.warning.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: C.status.warning.fg }}>OFFLINE</Text>
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
           <Text style={styles.quickActionText}>Indicar{'\n'}Profissional</Text>
         </TouchableOpacity>

         <TouchableOpacity style={styles.quickActionCard}>
           <View style={[styles.quickActionIcon, { backgroundColor: C.status.danger.bg }]}>
             <Ionicons name="document-text" size={22} color={MEDIA_TAG_COLORS.DAMAGE} />
           </View>
           <Text style={styles.quickActionText}>Meus{'\n'}Contratos</Text>
         </TouchableOpacity>

         <TouchableOpacity style={styles.quickActionCard}>
           <View style={[styles.quickActionIcon, { backgroundColor: C.status.success.bg }]}>
             <Ionicons name="wallet" size={22} color={C.success.text} />
           </View>
           <Text style={styles.quickActionText}>Pagamentos{'\n'}Pendentes</Text>
         </TouchableOpacity>

         <TouchableOpacity style={styles.quickActionCard}>
           <View style={[styles.quickActionIcon, { backgroundColor: `${SERVICE_CATEGORY_COLORS.Pintura}22` }]}>
             <Ionicons name="star-half" size={22} color={SERVICE_CATEGORY_COLORS.Pintura} />
           </View>
           <Text style={styles.quickActionText}>Avaliar{'\n'}Serviços</Text>
         </TouchableOpacity>

         <TouchableOpacity style={styles.quickActionCard}>
           <View style={[styles.quickActionIcon, { backgroundColor: C.status.warning.bg }]}>
             <Ionicons name="shield-checkmark" size={22} color={C.branding} />
           </View>
           <Text style={styles.quickActionText}>Regras de{'\n'}Acesso</Text>
         </TouchableOpacity>
      </ScrollView>

      {/* Busca */}
      <View style={[styles.searchBar, { backgroundColor: C.cardWhite }]}>
        <Ionicons name="search-outline" size={18} color={C.textLight} />
        <TextInput
          style={[styles.searchInput, { color: C.primary }]}
          placeholder="Buscar por nome, serviço ou cidade..."
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
        data={CATEGORIES}
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
              {cat.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Lista */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={{ color: C.textSecondary, marginTop: 12 }}>Buscando prestadores...</Text>
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
              <Ionicons name="people-outline" size={52} color={C.textLight} />
              <Text style={styles.emptyTxt}>
                {search || category ? 'Nenhum resultado encontrado.' : 'Nenhum prestador disponível.'}
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

    card: {
      flexDirection: 'row',
      backgroundColor: C.cardWhite,
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: C.divider,
      shadowColor: C.slate,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
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
