import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getLocationZoneTypeVisual, resolveLocationZoneChrome } from '../utils/locationZoneTypeDisplay';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  zoneType?: string | null;
  iconSize?: number;
  containerSize?: number;
  style?: ViewStyle;
};

/**
 * Ícone compacto do tipo de local de atendimento — chip semântico (cores status / tema).
 */
export function LocationZoneTypeBadge({
  zoneType,
  iconSize = 14,
  containerSize = 24,
  style,
}: Props) {
  const { colors: C, dark } = useTheme();
  const { icon, label } = getLocationZoneTypeVisual(zoneType);
  const chrome = resolveLocationZoneChrome(zoneType, C, dark);
  const r = containerSize / 2;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: containerSize,
          height: containerSize,
          borderRadius: r,
          backgroundColor: chrome.backgroundColor,
          borderColor: chrome.borderColor,
          ...Platform.select({
            ios: {
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.08,
              shadowRadius: 3,
            },
            android: { elevation: 2 },
            default: {},
          }),
        },
        style,
      ]}
      accessibilityLabel={label}
      accessibilityRole="image"
    >
      <Ionicons name={icon} size={iconSize} color={chrome.iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
