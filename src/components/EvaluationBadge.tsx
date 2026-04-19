import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { EvalTone } from '../utils/evaluationDisplay';

type Props = {
  label: string;
  tone: EvalTone;
  size?: 'sm' | 'md';
  style?: ViewStyle;
};

function toneColors(
  C: ReturnType<typeof useTheme>['colors'],
  tone: EvalTone
): { bg: string; fg: string; border: string } {
  switch (tone) {
    case 'success':
      return { bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0' };
    case 'info':
      return { bg: '#eff6ff', fg: '#1d4ed8', border: '#bfdbfe' };
    case 'warning':
      return { bg: '#fffbeb', fg: '#b45309', border: '#fde68a' };
    case 'danger':
      return { bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' };
    default:
      return { bg: C.surfaceLow ?? '#f1f5f9', fg: C.textSecondary, border: C.divider };
  }
}

export function EvaluationBadge({ label, tone, size = 'md', style }: Props) {
  const { colors: C } = useTheme();
  const { bg, fg, border } = toneColors(C, tone);
  const pad = size === 'sm' ? { py: 3, px: 8, font: 11 as const } : { py: 5, px: 11, font: 12 as const };

  return (
    <View style={[styles.wrap, { backgroundColor: bg, borderColor: border, paddingVertical: pad.py, paddingHorizontal: pad.px }, style]}>
      <Text style={[styles.text, { color: fg, fontSize: pad.font }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
  },
  text: {
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
