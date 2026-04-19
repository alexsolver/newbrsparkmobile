import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ColorPalette } from '../../../src/theme/colors';
import { tabBarOuterHeight } from '../../../src/components/FloatingRadialMenu';
import { useTheme } from '../../../src/theme/ThemeContext';
import { AssetCard } from '../../../src/components/AssetCard';
import { getLocalAssets } from '../../../src/database';
import { Asset } from '../../../src/types/asset';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/hooks/useAuth';
import { userHasCapability } from '../../../src/services/auth';
import { usePersona } from '../../../src/context/PersonaContext';
import { getPersonaHomeHref } from '../../../src/navigation/personaRouting';

export default function AssetsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarH = useMemo(() => tabBarOuterHeight(insets.bottom), [insets.bottom]);
  const listBottomPad = useMemo(() => tabBarH + 56 + 20, [tabBarH]);
  const { colors: C } = useTheme();
  const styles = useMemo(() => createAssetsStyles(C), [C]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [search, setSearch] = useState('');
  const router = useRouter();
  const { user, userRole, loading } = useAuth();
  const { activePersona } = usePersona();
  const inClientPersona = activePersona === 'client';
  const providerModeOnly = userRole === 'TECHNICIAN' && userHasCapability(user, 'mobile.mode.provider');

  useEffect(() => {
    if (loading || inClientPersona) return;
    if (!providerModeOnly) return;
    router.replace(getPersonaHomeHref(activePersona) as any);
  }, [loading, inClientPersona, providerModeOnly, activePersona, router]);

  useFocusEffect(
    useCallback(() => {
      setAssets(getLocalAssets(undefined, { includeMobileWarehouse: false }));
    }, [])
  );

  const filteredAssets = assets.filter(
    (a) =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.details?.address?.toLowerCase().includes(search.toLowerCase())
  );

  if (providerModeOnly && !inClientPersona) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Ativos</Text>
      </View>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={C.textLight} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar ativos..."
          placeholderTextColor={C.textLight}
          value={search}
          onChangeText={setSearch}
          returnKeyType="done"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={C.textLight} />
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={filteredAssets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
        renderItem={({ item }) => (
          <AssetCard asset={item} onPress={() => router.push(`/asset/${item.id}` as any)} />
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Nenhum ativo encontrado.</Text>}
      />
      <TouchableOpacity
        style={[styles.fab, { bottom: tabBarH + 16 }]}
        onPress={() => router.push('/asset/new' as any)}
      >
        <Ionicons name="add" size={30} color={C.cardWhite} />
      </TouchableOpacity>
    </View>
  );
}

function createAssetsStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 0 },
    title: { fontSize: 22, fontWeight: '900', color: C.primary, letterSpacing: -0.5, marginBottom: 4 },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.cardWhite,
      margin: 16,
      paddingHorizontal: 12,
      borderRadius: 12,
      shadowColor: C.slate,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 3,
    },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: C.primary, fontWeight: '600' },
    listContent: { paddingHorizontal: 16 },
    emptyText: { textAlign: 'center', color: C.textSecondary, marginTop: 24, fontSize: 12, fontWeight: '500' },
    fab: {
      position: 'absolute',
      right: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: C.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 6,
    },
  });
}
