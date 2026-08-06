import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { ColorScheme, DarkColors, LightColors } from '../constants/Colors';

export type ThemeMode = 'dark' | 'light' | 'system';

type ThemeContextType = {
  isDark: boolean;
  isReady: boolean;
  themeMode: ThemeMode;
  colors: ColorScheme;
  setThemeMode: (mode: ThemeMode) => void;
  /** @deprecated use setThemeMode */
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  isReady: false,
  themeMode: 'system',
  colors: DarkColors,
  setThemeMode: () => {},
  toggleTheme: () => {},
});

const THEME_KEY = 'vscore_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((val) => {
        if (val === 'dark' || val === 'light' || val === 'system') setThemeModeState(val);
      })
      .finally(() => setIsReady(true));
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_KEY, mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeMode(themeMode === 'dark' ? 'light' : 'dark');
  }, [themeMode, setThemeMode]);

  const isDark = themeMode === 'system' ? (systemScheme ?? 'dark') === 'dark' : themeMode === 'dark';

  // Keep native iOS surfaces (including Liquid Glass tab bars) aligned with
  // the app theme. Without this, a dark app can still render a light native
  // tab bar when the simulator itself is in light mode.
  useEffect(() => {
    Appearance.setColorScheme(themeMode === 'system' ? null : isDark ? 'dark' : 'light');
  }, [themeMode, isDark]);

  return (
    <ThemeContext.Provider value={{ isDark, isReady, themeMode, colors: isDark ? DarkColors : LightColors, setThemeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useColors = () => useContext(ThemeContext).colors;
export const useTheme = () => useContext(ThemeContext);
