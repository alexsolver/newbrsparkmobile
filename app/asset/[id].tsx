import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Asset } from '../../src/types/asset';
import { getLocalAssets, queueOfflineAction } from '../../src/database';
import { colors } from '../../src/theme/colors';
import { Badge } from '../../src/components/Badge';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AssetDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [asset, setAsset] = useState<Asset | null>(null);

  useEffect(() => {
    const localDb = getLocalAssets();
    const found = localDb.find(a => a.id === id);
    if (found) setAsset(found);
  }, [id]);

  const handleMaintenance = () => {
    // Add offline action to sync queue
    queueOfflineAction('SCHEDULE_MAINTENANCE', { assetId: id, timestamp: Date.now() });
    Alert.alert('Sucesso', 'Manutenção agendada com sucesso! \n\n(Esta ação foi salva offline e será enviada quando sincronizar)');
  };

  if (!asset) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>Carregando ativo {id} ...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header Clássico com Voltar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalhes do Ativo</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.imageContainer}>
          {asset.imageUrl ? (
             <Image source={{ uri: asset.imageUrl }} style={styles.image} />
          ) : (
             <View style={styles.imagePlaceholder}>
               <Ionicons name="image-outline" size={40} color={colors.textLight} />
             </View>
          )}
          <View style={styles.badgeContainer}>
            <Badge label={asset.status} type={asset.statusType} />
          </View>
        </View>

        <View style={styles.detailsArea}>
          <Text style={styles.title}>{asset.title}</Text>
          <Text style={styles.typeTag}>{asset.type === 'REAL_ESTATE' ? 'Imóvel' : 'Veículo'}</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Informações</Text>
            {asset.details?.address && (
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.infoText}>{asset.details.address}</Text>
              </View>
            )}
            {asset.details?.mileage && (
              <View style={styles.infoRow}>
                <Ionicons name="speedometer-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.infoText}>{asset.details.mileage.toLocaleString()} mi</Text>
              </View>
            )}
            {asset.details?.year && (
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.infoText}>Ano: {asset.details.year}</Text>
              </View>
            )}
            <View style={[styles.infoRow, { marginTop: 8 }]}>
                <Ionicons name="barcode-outline" size={20} color={colors.textSecondary} />
                <Text style={styles.infoText}>ID: {asset.id}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.actionButton} onPress={handleMaintenance}>
            <Ionicons name="build" size={20} color="#fff" style={{marginRight: 8}}/>
            <Text style={styles.actionButtonText}>Agendar Manutenção</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.cardWhite },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.primary },
  content: { paddingBottom: 40 },
  imageContainer: { width: '100%', height: 250, position: 'relative' },
  image: { width: '100%', height: '100%', backgroundColor: colors.border },
  imagePlaceholder: { width: '100%', height: '100%', backgroundColor: '#F2F4F7', justifyContent: 'center', alignItems: 'center' },
  badgeContainer: { position: 'absolute', bottom: 16, left: 16 },
  detailsArea: { padding: 16 },
  title: { fontSize: 24, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  typeTag: { fontSize: 14, color: colors.textSecondary, marginBottom: 24, fontWeight: '600' },
  card: { backgroundColor: colors.cardWhite, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 24 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.primary, marginBottom: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  infoText: { fontSize: 14, color: colors.primary, marginLeft: 12, flex: 1 },
  actionButton: { backgroundColor: colors.primary, borderRadius: 8, flexDirection: 'row', paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' }
});
