import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { colors } from '../../src/theme/colors';
import { Header } from '../../src/components/Header';
import { AssetCard } from '../../src/components/AssetCard';
import { Asset } from '../../src/types/asset';
import { getLocalAssets, saveAssetsLocal } from '../../src/database';
import { ApiService } from '../../src/services/api';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '../../src/components/Badge';

export default function DashboardScreen() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');

  const loadAssets = () => {
    let local = getLocalAssets();
    // Preenche automaticamente o banco com mock local se estiver vazio pela 1a vez
    if (local.length === 0) {
      const MOCK_ASSETS: Asset[] = [
        {
          id: '1', title: 'Bel Air Residence', type: 'REAL_ESTATE',
          imageUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&w=800&q=80',
          status: 'MAINTENANCE OK', statusType: 'success',
          details: { address: 'Los Angeles, CA' },
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

  const renderContent = () => {
    if (viewMode === 'list') {
      return (
        <View style={{ paddingHorizontal: 16 }}>
          {assets.map((asset) => (
            <TouchableOpacity 
              key={asset.id} 
              activeOpacity={0.8}
              onPress={() => router.push(`/asset/${asset.id}` as any)}
              style={styles.listCard}
            >
              <View style={styles.listInfo}>
                <Text style={styles.listTitle}>{asset.title}</Text>
                <Text style={styles.listType}>
                  {asset.type === 'REAL_ESTATE' ? 'Imóvel' : asset.type === 'VEHICLE' ? 'Veículo' : asset.type === 'COLLECTION' ? 'Coleção' : 'Outros'} • ID: {asset.id}
                </Text>
              </View>
              <Badge label={asset.status} type={asset.statusType} />
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    // Default 'cards' mode
    return (
      <View style={{ paddingHorizontal: 16 }}>
        {assets.map((asset) => (
          <TouchableOpacity 
            key={asset.id} 
            activeOpacity={0.8}
            onPress={() => router.push(`/asset/${asset.id}` as any)}
          >
            <AssetCard asset={asset} />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Header />
      <ScrollView 
        style={styles.scrollView} 
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Portfólio Ativo</Text>

          <View style={styles.selectorGroup}>
            <TouchableOpacity 
              style={[styles.selectorBtn, viewMode === 'list' && styles.selectorBtnActive]}
              onPress={() => setViewMode('list')}
            >
              <Ionicons name="list" size={20} color={viewMode === 'list' ? colors.primary : colors.textLight} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.selectorBtn, viewMode === 'cards' && styles.selectorBtnActive]}
              onPress={() => setViewMode('cards')}
            >
              <Ionicons name="grid" size={20} color={viewMode === 'cards' ? colors.primary : colors.textLight} />
            </TouchableOpacity>
          </View>
        </View>
        
        {renderContent()}

        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.primary },
  
  selectorGroup: { flexDirection: 'row', backgroundColor: '#F2F4F7', borderRadius: 8, padding: 4 },
  selectorBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  selectorBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },

  listCard: { backgroundColor: colors.cardWhite, padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listInfo: { flex: 1, paddingRight: 12 },
  listTitle: { fontSize: 16, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  listType: { fontSize: 12, color: colors.textSecondary },
});
