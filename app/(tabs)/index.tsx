import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { colors } from '../../src/theme/colors';
import { Header } from '../../src/components/Header';
import { AssetCard } from '../../src/components/AssetCard';
import { Asset } from '../../src/types/asset';
import { getLocalAssets, saveAssetsLocal } from '../../src/database';
import { ApiService } from '../../src/services/api';
import { useRouter, useFocusEffect } from 'expo-router';

export default function DashboardScreen() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadAssets = () => {
    let local = getLocalAssets();
    // Preenche automaticamente o banco com mock local se estiver vazio pela 1a vez
    if (local.length === 0) {
      const MOCK_ASSETS: Asset[] = [
        {
          id: '1', title: 'Bel Air Residence', type: 'REAL_ESTATE',
          imageUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&w=800&q=80',
          status: 'MAINTENANCE OK', statusType: 'success',
          details: { address: '10424 Bellagio Rd, Los Angeles, CA' },
        },
        {
          id: '2', title: 'Toyota Corolla Hybrid', type: 'VEHICLE',
          imageUrl: 'https://images.unsplash.com/photo-1629897048514-3dd741530282?ixlib=rb-4.0.3&w=800&q=80',
          status: 'INSURANCE RENEWAL SOON', statusType: 'warning',
          details: { mileage: 12450, year: 2023 },
        }
      ];
      saveAssetsLocal(MOCK_ASSETS);
      local = MOCK_ASSETS;
    }
    setAssets(local);
  };

  useFocusEffect(
    useCallback(() => {
      loadAssets();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await ApiService.sync(); // tries to push offline actions and pull fresh API assets
    loadAssets();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <Header />
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Portfolio</Text>
          <TouchableOpacity onPress={() => router.push('/assets')}>
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        </View>
        
        {assets.map((asset) => (
          <TouchableOpacity 
            key={asset.id} 
            activeOpacity={0.8}
            onPress={() => router.push(`/asset/${asset.id}` as any)}
          >
            <AssetCard asset={asset} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1 },
  content: { padding: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.primary },
  viewAllText: { fontSize: 14, fontWeight: '600', color: '#007AFF' },
});
