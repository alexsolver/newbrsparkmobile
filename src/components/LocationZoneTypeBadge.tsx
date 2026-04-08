import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getLocationZoneTypeVisual } from '../utils/locationZoneTypeDisplay';

type Props = {
  zoneType?: string | null;
  iconSize?: number;
  containerSize?: number;
  style?: ViewStyle;
};

/**
 * Ícone compacto do tipo de local de atendimento (independente do estado da OS).
 */
export function LocationZoneTypeBadge({
  zoneType,
  iconSize = 14,
  containerSize = 24,
  style,
}: Props) {
  const { icon, label } = getLocationZoneTypeVisual(zoneType);

  return (
    <View
      style={[
        styles.wrap,
        { width: containerSize, height: containerSize, borderRadius: containerSize / 2 },
        style,
      ]}
      accessibilityLabel={label}
      accessibilityRole="image"
    >
      <Ionicons name={icon} size={iconSize} color="#64748B" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
});
