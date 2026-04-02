import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity , KeyboardAvoidingView, Platform} from 'react-native';
import { colors } from '../../src/theme/colors';
import { Header } from '../../src/components/Header';
import { AssetCard } from '../../src/components/AssetCard';
import { getLocalAssets } from '../../src/database';
import { Asset } from '../../src/types/asset';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function AssetsScreen() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [search, setSearch] = useState('');
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      setAssets(getLocalAssets());
    }, [])
  );

  const filteredAssets = assets.filter(a =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.details?.address?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textLight} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar ativos..."
          placeholderTextColor={colors.textLight}
          value={search}
          onChangeText={setSearch}
        returnKeyType="done"
                      />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.textLight} />
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={filteredAssets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <AssetCard
            asset={item}
            onPress={() => router.push(`/asset/${item.id}` as any)}
          />
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Nenhum ativo encontrado.</Text>}
      />
      <TouchableOpacity style={styles.fab} onPress={() => router.push('/asset/new' as any)}>
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardWhite, margin: 16, paddingHorizontal: 12, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.primary, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingBottom: 80 },
  emptyText: { textAlign: 'center', color: colors.textSecondary, marginTop: 24, fontSize: 12, fontWeight: '500' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6 }
});
