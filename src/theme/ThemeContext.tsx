import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, ColorPalette } from './colors';

interface ThemeCtx {
  dark: boolean;
  colors: ColorPalette;
  toggleDarkMode: (val: boolean) => Promise<void>;
}

const ThemeContext = createContext<ThemeCtx>({
  dark: false,
  colors: lightColors,
  toggleDarkMode: async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('@pref_dark_mode').then(v => {
      if (v) setDark(JSON.parse(v));
    });
  }, []);

  const toggleDarkMode = async (val: boolean) => {
    setDark(val);
    await AsyncStorage.setItem('@pref_dark_mode', JSON.stringify(val));
  };

  const palette = dark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ dark, colors: palette, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
