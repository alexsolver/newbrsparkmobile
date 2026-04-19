import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';

export type ScreenSubheaderProps = {
  title: string;
  subtitle?: string | null;
  onBack: () => void;
  /** Padrão alinhado a Busca de OS (`arrow-back`). */
  leftIcon?: keyof typeof Ionicons.glyphMap;
  /** Ação à direita (ex.: atualizar), como em Busca de OS. */
  onRightPress?: () => void | Promise<void>;
  rightDisabled?: boolean;
  rightLoading?: boolean;
};

/**
 * Segunda faixa sob o cabeçalho global (logo + alertas + avatar): título, texto de apoio e ação opcional.
 * Mesmo contrato visual de `app/provider-os-search.tsx`.
 */
export function ScreenSubheader({
  title,
  subtitle,
  onBack,
  leftIcon = 'arrow-back',
  onRightPress,
  rightDisabled,
  rightLoading,
}: ScreenSubheaderProps) {
  const { colors: C } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: C.divider,
        backgroundColor: C.cardWhite,
      }}
    >
      <Pressable onPress={onBack} hitSlop={14} style={{ padding: 8, marginRight: 4 }}>
        <Ionicons name={leftIcon as any} size={24} color={C.slate} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 18, fontWeight: '900', color: C.slate }} numberOfLines={2} ellipsizeMode="tail">
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 12, color: C.textLight, marginTop: 2 }} numberOfLines={4}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onRightPress ? (
        <Pressable
          onPress={() => void onRightPress()}
          style={{ padding: 8 }}
          disabled={rightDisabled || rightLoading}
        >
          <Ionicons name="refresh" size={22} color={rightDisabled || rightLoading ? C.border : C.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}
