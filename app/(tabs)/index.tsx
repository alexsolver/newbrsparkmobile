import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { colors } from '../../src/theme/colors';
import { Header } from '../../src/components/Header';
import { AssetCard } from '../../src/components/AssetCard';
import { Asset } from '../../src/types/asset';
import { getRootAssets, saveAssetsLocal } from '../../src/database';
import { ApiService } from '../../src/services/api';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '../../src/components/Badge';
import { StockService } from '../../src/services/stockService';
import { StockItem } from '../../src/types/stock';

export default function DashboardScreen() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [activeFilter, setActiveFilter] = useState<string>('ALL');

  const loadData = async () => {
    // Carregar Ativos
    let local = getRootAssets();
    if (local.length === 0) {
      const MOCK_ASSETS: any[] = [
        { id: '1', title: 'Barco Brspark', type: 'COLLECTION', imageUrl: 'https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=800', status: 'OPERACIONAL', statusType: 'success' },
        { id: '2', title: 'Casa de Praia', type: 'REAL_ESTATE', imageUrl: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800', status: 'ALUGADO', statusType: 'warning' }
      ];
      saveAssetsLocal(MOCK_ASSETS);
      local = getRootAssets();
    }
    setAssets(local);

    // Carregar Stock para os indicadores
    const items = await StockService.getItems();
    setStockItems(items);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await ApiService.sync();
    await loadData();
    setRefreshing(false);
  };

  const getAssetStockInfo = (assetId: string) => {
    const items = stockItems.filter(i => i.locationId === assetId);
    const hasLow = items.some(i => i.currentStock <= i.minStock);
    return { hasStock: items.length > 0, hasLowStock: hasLow };
  };

  const renderContent = () => {
    const visibleAssets = assets.filter(a => activeFilter === 'ALL' || a.type === activeFilter);

    if (viewMode === 'list') {
      return (
        <View style={{ paddingHorizontal: 16 }}>
          {visibleAssets.map((asset) => {
            const stockInfo = getAssetStockInfo(asset.id);
            return (
              <TouchableOpacity 
                key={asset.id} 
                activeOpacity={0.8}
                onPress={() => router.push(`/asset/${asset.id}` as any)}
                style={styles.listCard}
              >
                <View style={styles.listInfo}>
                  <View style={{flexDirection:'row', alignItems:'center'}}>
                    <Text style={styles.listTitle}>{asset.title}</Text>
                    {stockInfo.hasStock && <Ionicons name="cube" size={14} color={stockInfo.hasLowStock ? '#EF4444' : colors.primary} style={{marginLeft: 8}} />}
                  </View>
                  <Text style={styles.listType}>
                    {asset.type === 'REAL_ESTATE' ? 'Imóvel' : asset.type === 'VEHICLE' ? 'Veículo' : 'Patrimônio'}
                  </Text>
                </View>
                <Badge label={asset.status} type={asset.statusType} />
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    return (
      <View style={{ paddingHorizontal: 16 }}>
        {visibleAssets.map((asset) => {
          const stockInfo = getAssetStockInfo(asset.id);
          return (
            <AssetCard 
              key={asset.id} 
              asset={asset} 
              onPress={() => router.push(`/asset/${asset.id}` as any)}
              hasStock={stockInfo.hasStock}
              hasLowStock={stockInfo.hasLowStock}
            />
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Header />
      <ScrollView 
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Portfólio Ativo</Text>
          <View style={styles.selectorGroup}>
            <TouchableOpacity style={styles.selectorBtn} onPress={() => router.push('/asset/tree' as any)}><Ionicons name="git-branch-outline" size={20} color={colors.primary} /></TouchableOpacity>
            <TouchableOpacity style={[styles.selectorBtn, viewMode === 'list' && styles.selectorBtnActive]} onPress={() => setViewMode('list')}><Ionicons name="list" size={20} color={viewMode === 'list' ? colors.primary : colors.textLight} /></TouchableOpacity>
            <TouchableOpacity style={[styles.selectorBtn, viewMode === 'cards' && styles.selectorBtnActive]} onPress={() => setViewMode('cards')}><Ionicons name="grid" size={20} color={viewMode === 'cards' ? colors.primary : colors.textLight} /></TouchableOpacity>
          </View>
        </View>
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll} style={{marginBottom: 16}}>
           {[
              { id: 'ALL', label: 'Todos' },
              { id: 'REAL_ESTATE', label: 'Imóveis' },
              { id: 'VEHICLE', label: 'Veículos' },
              { id: 'COLLECTION', label: 'Patrimônios' }
           ].map(f => (
             <TouchableOpacity key={f.id} style={[styles.filterChip, activeFilter === f.id && styles.filterChipActive]} onPress={() => setActiveFilter(f.id)}><Text style={[styles.filterChipText, activeFilter === f.id && styles.filterChipTextActive]}>{f.label}</Text></TouchableOpacity>
           ))}
        </ScrollView>
        {renderContent()}
        <View style={{height: 100}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 22, fontWeight: '900', color: colors.primary, letterSpacing: -0.5 },
  selectorGroup: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4 },
  selectorBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  selectorBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  listCard: { backgroundColor: colors.cardWhite, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listInfo: { flex: 1, paddingRight: 12 },
  listTitle: { fontSize: 16, fontWeight: '800', color: colors.primary },
  listType: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  filterScroll: { paddingHorizontal: 16, paddingBottom: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0', marginRight: 8 },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  filterChipTextActive: { color: '#fff', fontWeight: '800' },
});
