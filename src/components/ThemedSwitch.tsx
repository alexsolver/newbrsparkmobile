import React from 'react';
import { Switch, SwitchProps, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type Props = Omit<SwitchProps, 'trackColor' | 'thumbColor' | 'ios_backgroundColor'>;

export function ThemedSwitch(props: Props) {
  const { colors: C } = useTheme();
  return (
    <Switch
      trackColor={{ false: C.switch.trackOff, true: C.switch.trackOn }}
      thumbColor={C.switch.thumb}
      ios_backgroundColor={C.switch.trackOff}
      {...props}
    />
  );
}
