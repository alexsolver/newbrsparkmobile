import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import type { TFunction } from 'i18next';
import { Ionicons } from '@expo/vector-icons';
import type { ColorPalette } from '../theme/colors';

type Props = {
  C: ColorPalette;
  t: TFunction;
  /** Quando true (acessibilidade), sem pulsação. */
  reduceMotion?: boolean;
};

/**
 * Pastilha na lista de OS quando existe `transit_start` sem `transit_end` (lock global no aparelho).
 */
export function ProviderOpenTransitBadge({ C, t, reduceMotion }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.78,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  const label = t('providerDashboard.openTransitBadge', 'Deslocamento iniciado');

  return (
    <Animated.View style={{ opacity: reduceMotion ? 1 : pulse }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 999,
          backgroundColor: `${C.primary}18`,
          borderWidth: 1.5,
          borderColor: C.primary,
        }}
        accessibilityRole="text"
        accessibilityLabel={label}
      >
        <Ionicons name="navigate-circle" size={13} color={C.primary} />
        <Text
          numberOfLines={1}
          style={{
            fontSize: 10,
            fontWeight: '900',
            color: C.primary,
            letterSpacing: 0.2,
            maxWidth: 168,
          }}
        >
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}
