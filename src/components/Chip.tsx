import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle, StyleProp, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius, space } from '../theme/layout';

export type ChipVariant = 'filter' | 'tag' | 'segment';

type Props = {
  label: string;
  selected?: boolean;
  variant?: ChipVariant;
  onPress?: () => void;
  /** Cor de acento (borda/texto quando não selecionado; fundo quando selecionado) */
  accentColor?: string;
  leftIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
};

export function Chip({
  label,
  selected = false,
  variant = 'filter',
  onPress,
  accentColor,
  leftIcon,
  style,
  textStyle,
  disabled,
}: Props) {
  const { colors: C } = useTheme();
  const accent = accentColor ?? C.primary;

  const padV = variant === 'segment' ? 10 : 8;
  const padH = variant === 'segment' ? 12 : 10;
  const r = variant === 'segment' ? radius.md : radius.sm;

  const bg = selected ? accent : C.cardWhite;
  const border = selected ? accent : C.border;
  const labelColor = selected
    ? C.filledButtonFg
    : variant === 'filter'
      ? C.slate
      : accent;

  const content = (
    <View style={styles.row}>
      {leftIcon}
      <Text numberOfLines={1} style={[styles.label, { color: labelColor }, textStyle]}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) {
    return (
      <View
        style={[
          styles.base,
          { paddingVertical: padV, paddingHorizontal: padH, borderRadius: r, backgroundColor: bg, borderColor: border },
          style,
        ]}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          paddingVertical: padV,
          paddingHorizontal: padH,
          borderRadius: r,
          backgroundColor: selected ? accent : pressed ? C.surfaceLow : C.cardWhite,
          borderColor: border,
          borderWidth: StyleSheet.hairlineWidth * 2,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs / 2,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
});
