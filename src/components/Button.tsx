import React from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius } from '../theme/layout';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

type Props = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  textStyle,
  testID,
}: Props) {
  const { colors: C } = useTheme();
  const isDisabled = disabled || loading;

  const bg =
    variant === 'primary'
      ? C.primary
      : variant === 'secondary'
        ? C.surfaceLow
        : variant === 'destructive'
          ? C.status.danger.fg
          : 'transparent';

  const borderColor =
    variant === 'secondary' ? C.border : variant === 'ghost' ? C.border : 'transparent';
  const borderWidth = variant === 'secondary' || variant === 'ghost' ? StyleSheet.hairlineWidth * 2 : 0;

  const color =
    variant === 'primary'
      ? C.filledButtonFg
      : variant === 'destructive'
        ? C.filledButtonFg
        : variant === 'secondary'
          ? C.slate
          : C.primary;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor,
          borderWidth,
          opacity: isDisabled ? 0.5 : pressed ? 0.88 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.label, { color }, textStyle]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
});
