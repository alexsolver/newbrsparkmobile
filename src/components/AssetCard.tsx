import React from 'react';
import { View, Text, StyleSheet, Image, ViewStyle } from 'react-native';
import { Asset } from '../types/asset';
import { Badge } from './Badge';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';

interface AssetCardProps {
  asset: Asset;
  style?: ViewStyle;
}

export function AssetCard({ asset, style }: AssetCardProps) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.imageContainer}>
        {asset.imageUrl ? (
          <Image source={{ uri: asset.imageUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="image-outline" size={40} color={colors.textLight} />
          </View>
        )}
        <View style={styles.badgeContainer}>
          <Badge label={asset.status} type={asset.statusType} />
        </View>
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{asset.title}</Text>
        {asset.type === 'REAL_ESTATE' && asset.details?.address && (
          <Text style={styles.subtitle}>{asset.details.address}</Text>
        )}
        {asset.type === 'VEHICLE' && (
          <View style={styles.detailsRow}>
            {asset.details?.mileage && (
              <View style={styles.detailItem}>
                <Ionicons name="speedometer-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.detailText}>{asset.details.mileage.toLocaleString()} mi</Text>
              </View>
            )}
            {asset.details?.year && (
              <View style={styles.detailItem}>
                <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.detailText}>{asset.details.year}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 16,
  },
  imageContainer: {
    height: 160,
    width: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F2F4F7',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  detailsRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
