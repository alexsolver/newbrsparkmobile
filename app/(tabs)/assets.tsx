import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity } from 'react-native';
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
      <Header />
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.textLight} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar ativos..."
          placeholderTextColor={colors.textLight}
          value={search}
          onChangeText={setSearch}
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
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardWhite, margin: 16, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.primary },
  listContent: { paddingHorizontal: 16, paddingBottom: 80 },
  emptyText: { textAlign: 'center', color: colors.textSecondary, marginTop: 24 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 }
});
