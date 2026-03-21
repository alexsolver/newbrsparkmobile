import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Alert, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Asset } from '../../src/types/asset';
import { getLocalAssets, queueOfflineAction } from '../../src/database';
import { colors } from '../../src/theme/colors';
import { Badge } from '../../src/components/Badge';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const MODULES = [
  { id: 'info', title: 'Geral', subtitle: 'Info', icon: 'information-circle-outline' as const, color: '#3B82F6' },
  { id: 'docs', title: 'Documentos', subtitle: 'Vault', icon: 'folder-open-outline' as const, color: '#8B5CF6' },
  { id: 'maint', title: 'Manutenção', subtitle: 'Calendário técnico', icon: 'build-outline' as const, color: '#F59E0B' },
  { id: 'wifi', title: 'Rede & Wi-Fi', subtitle: 'TI', icon: 'wifi-outline' as const, color: '#06B6D4' },
  { id: 'costs', title: 'Custos', subtitle: 'Finanças', icon: 'cash-outline' as const, color: '#10B981' },
  { id: 'insurance', title: 'Seguro', subtitle: 'Sinistros', icon: 'shield-checkmark-outline' as const, color: '#EF4444' },
  { id: 'contacts', title: 'Contatos', subtitle: 'Prestadores', icon: 'people-outline' as const, color: '#6366F1' },
  { id: 'history', title: 'Histórico', subtitle: 'Movimentação', icon: 'time-outline' as const, color: '#64748B' },
  { id: 'reports', title: 'Relatórios', subtitle: 'Performance', icon: 'document-text-outline' as const, color: '#EC4899' },
];

export default function AssetDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [asset, setAsset] = useState<Asset | null>(null);

  useEffect(() => {
    const localDb = getLocalAssets();
    const found = localDb.find(a => a.id === id);
    if (found) setAsset(found);
  }, [id]);

  const handleModuleClick = (moduleId: string, title: string) => {
    if (moduleId === 'maint') {
      queueOfflineAction('SCHEDULE_MAINTENANCE', { assetId: id, timestamp: Date.now() });
      Alert.alert('Sucesso', 'Manutenção agendada e salva na Fila Offline!');
    } else {
      Alert.alert('Módulo B2B', `Em breve acessando a tela dedicada de: ${title}`);
    }
  };

  if (!asset) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>Carregando gerenciador do ativo {id} ...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gestão do Ativo</Text>
        <TouchableOpacity style={styles.backButton}>
           <Ionicons name="ellipsis-vertical" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.imageContainer}>
            {asset.imageUrl ? (
               <Image source={{ uri: asset.imageUrl }} style={styles.image} />
            ) : (
               <View style={styles.imagePlaceholder}>
                 <Ionicons name="business-outline" size={50} color={colors.textLight} />
               </View>
            )}
            <View style={styles.badgeContainer}>
              <Badge label={asset.status} type={asset.statusType} />
            </View>
          </View>
          
          <View style={styles.heroDetails}>
            <Text style={styles.title}>{asset.title}</Text>
            <Text style={styles.typeTag}>
              {asset.type === 'REAL_ESTATE' ? 'Imóvel' : asset.type === 'VEHICLE' ? 'Veículo' : asset.type === 'COLLECTION' ? 'Coleção' : 'Outros'} • Cód: {asset.id}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Módulos do Ativo</Text>
        
        <View style={styles.gridContainer}>
          {MODULES.map(mod => (
             <TouchableOpacity 
               key={mod.id} 
               style={styles.gridItem} 
               activeOpacity={0.7}
               onPress={() => handleModuleClick(mod.id, mod.title)}
             >
                <View style={[styles.iconBox, { backgroundColor: mod.color + '15' }]}>
                   <Ionicons name={mod.icon} size={28} color={mod.color} />
                </View>
                <Text style={styles.modTitle}>{mod.title}</Text>
                <Text style={styles.modSubtitle} numberOfLines={1}>{mod.subtitle}</Text>
             </TouchableOpacity>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');
// Calculate 3 items per row with gaps
const ITEM_WIDTH = (width - (16 * 2) - (12 * 2)) / 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.cardWhite },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.primary },
  content: { paddingBottom: 40 },
  heroCard: { backgroundColor: colors.cardWhite, marginBottom: 24, borderBottomWidth: 1, borderBottomColor: colors.border },
  imageContainer: { width: '100%', height: 220, position: 'relative' },
  image: { width: '100%', height: '100%', backgroundColor: colors.border },
  imagePlaceholder: { width: '100%', height: '100%', backgroundColor: '#F2F4F7', justifyContent: 'center', alignItems: 'center' },
  badgeContainer: { position: 'absolute', bottom: 12, left: 16 },
  heroDetails: { padding: 16 },
  title: { fontSize: 24, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  typeTag: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.primary, paddingHorizontal: 16, marginBottom: 16 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12 },
  gridItem: { width: ITEM_WIDTH, backgroundColor: colors.cardWhite, paddingVertical: 16, paddingHorizontal: 8, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  iconBox: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  modTitle: { fontSize: 13, fontWeight: '700', color: colors.primary, textAlign: 'center', marginBottom: 4 },
  modSubtitle: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' }
});
