import React from 'react';
import { View, Text, StyleSheet, Image, ScrollView, Dimensions, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { Asset } from '../types/asset';
import { colors } from '../theme/colors';
import { Badge } from './Badge';

const { width } = Dimensions.get('window');
// Padding horizontal do View container no index é 16, então (16*2) = 32 pixels gastos na margem do scrollView pai.
// Para que a imagem ocupe exatamente o espaço interno do AssetCard perfeitamente sem vazar.
const CARD_MARGIN = 32; 

interface AssetCardProps {
  asset: Asset;
  onPress?: () => void;
}

export function AssetCard({ asset, onPress }: AssetCardProps) {
  // Coletamos a galeria inteira, senão usamos a string padrao, senão array vazio.
  const photos = asset.details?.photos?.length > 0 ? asset.details.photos : (asset.imageUrl ? [asset.imageUrl] : []);

  return (
    <View style={styles.card}>
      <View style={styles.imageContainer}>
        {photos.length > 0 ? (
          <ScrollView 
             horizontal 
             pagingEnabled 
             showsHorizontalScrollIndicator={true}
             indicatorStyle="white"
             style={{ width: '100%', height: '100%' }}
          >
             {photos.map((uri: string, idx: number) => (
                <TouchableWithoutFeedback key={idx} onPress={onPress}>
                  <View style={{ width: width - CARD_MARGIN, height: '100%' }}>
                    <Image source={{ uri }} style={styles.image} resizeMode="cover" />
                  </View>
                </TouchableWithoutFeedback>
             ))}
          </ScrollView>
        ) : (
          <TouchableWithoutFeedback onPress={onPress}>
            <View style={styles.imagePlaceholder}>
              <Text style={{color: colors.textLight, fontWeight: '600'}}>Sem Fotos Físicas Acopladas</Text>
            </View>
          </TouchableWithoutFeedback>
        )}
        
        {/* Mostra a Badge de status oficial por cima das fotos na esquerda inferior */}
        <View style={styles.badgeContainer} pointerEvents="none">
          <Badge label={asset.status} type={asset.statusType} />
        </View>

        {/* Indicativo de que o ativo possui múltiplas fotos se length > 1 */}
        {photos.length > 1 && (
           <View style={styles.carouselDotContainer} pointerEvents="none">
              <Text style={styles.carouselText}>▶ {photos.length} Fotos (Deslize)</Text>
           </View>
        )}
      </View>

      <TouchableOpacity style={styles.details} onPress={onPress} activeOpacity={0.8}>
        <Text style={styles.title}>{asset.title}</Text>
        <Text style={styles.typeTag}>
          {asset.type === 'REAL_ESTATE' ? 'Imóvel Nativo' : asset.type === 'VEHICLE' ? 'Veículo Terrestre' : asset.type === 'COLLECTION' ? 'Artefato Físico' : 'Dispositivo Eletrônico'}
        </Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoText}>Cód SaaS: {asset.id}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardWhite,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden', // garante bordas limpas
  },
  imageContainer: {
    width: '100%',
    height: 200,
    position: 'relative',
    backgroundColor: '#F8FAFC',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F2F4F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeContainer: {
    position: 'absolute',
    bottom: 12,
    left: 16,
  },
  carouselDotContainer: {
    position: 'absolute',
    bottom: 12,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12
  },
  carouselText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700'
  },
  details: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  typeTag: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
    fontWeight: '600'
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start'
  },
  infoText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
});
