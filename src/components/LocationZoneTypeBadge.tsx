import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getLocationZoneTypeVisual } from '../utils/locationZoneTypeDisplay';
import { useTheme } from '../theme/ThemeContext';

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
  const { colors: C } = useTheme();
  const { icon, label } = getLocationZoneTypeVisual(zoneType);

  return (
    <View
      style={[
        styles.wrap,
        {
          width: containerSize,
          height: containerSize,
          borderRadius: containerSize / 2,
          backgroundColor: C.surfaceLow,
          borderColor: C.border,
        },
        style,
      ]}
      accessibilityLabel={label}
      accessibilityRole="image"
    >
      <Ionicons name={icon} size={iconSize} color={C.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
