import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export type BadgeType = 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'default' | string;

interface BadgeProps {
  label: string;
  type?: BadgeType;
}

export function Badge({ label, type = 'default' }: BadgeProps) {
  let bgColor = '#F1F5F9';
  let textColor = '#64748B';

  switch (type) {
    case 'success':
      bgColor = '#DCFCE7';
      textColor = '#166534';
      break;
    case 'warning':
      bgColor = '#FEF3C7';
      textColor = '#92400E';
      break;
    case 'danger':
      bgColor = '#FEE2E2';
      textColor = '#991B1B';
      break;
    case 'info':
    case 'primary':
      bgColor = colors.primary + '15';
      textColor = colors.primary;
      break;
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)',
  },
  text: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
