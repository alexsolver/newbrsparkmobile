import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius, space } from '../theme/layout';

export type BadgeType = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'default' | string;

interface BadgeProps {
  label: string;
  type?: BadgeType;
}

export function Badge({ label, type = 'default' }: BadgeProps) {
  const { colors: C, dark } = useTheme();
  let bgColor = C.surfaceLow;
  let textColor = C.textSecondary;
  let borderColor = C.border;

  switch (type) {
    case 'success':
      bgColor = C.status.success.bg;
      textColor = C.status.success.fg;
      borderColor = C.status.success.border;
      break;
    case 'warning':
      bgColor = C.status.warning.bg;
      textColor = C.status.warning.fg;
      borderColor = C.status.warning.border;
      break;
    case 'danger':
      bgColor = C.status.danger.bg;
      textColor = C.status.danger.fg;
      borderColor = C.status.danger.border;
      break;
    case 'info':
      bgColor = C.status.info.bg;
      textColor = C.status.info.fg;
      borderColor = C.status.info.border;
      break;
    case 'primary':
      bgColor = C.primary + '18';
      textColor = dark ? C.accent : C.primary;
      borderColor = C.border;
      break;
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor, borderColor }]}>
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs / 2,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
