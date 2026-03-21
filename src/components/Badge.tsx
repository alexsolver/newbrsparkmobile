import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export type BadgeType = 'success' | 'warning';

interface BadgeProps {
  label: string;
  type: BadgeType;
}

export function Badge({ label, type }: BadgeProps) {
  const isSuccess = type === 'success';
  const bgColor = isSuccess ? colors.success.background : colors.warning.background;
  const textColor = isSuccess ? colors.success.text : colors.warning.text;

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
