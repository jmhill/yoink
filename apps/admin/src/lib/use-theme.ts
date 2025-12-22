import { useEffect, useState, useCallback } from 'react';

/** Light/dark mode preference */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Color palette/theme */
export type ColorTheme = 'default' | 'tokyo-night';

/** @deprecated Use ThemeMode instead */
export type Theme = ThemeMode;

const MODE_STORAGE_KEY = 'theme';
const COLOR_THEME_STORAGE_KEY = 'colorTheme';

const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getStoredMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(MODE_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
};

const getStoredColorTheme = (): ColorTheme => {
  if (typeof window === 'undefined') return 'default';
  const stored = localStorage.getItem(COLOR_THEME_STORAGE_KEY);
  if (stored === 'default' || stored === 'tokyo-night') {
    return stored;
  }
  return 'default';
};

const applyMode = (mode: ThemeMode) => {
  const resolved = mode === 'system' ? getSystemTheme() : mode;
  const root = document.documentElement;
  
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
};

const applyColorTheme = (colorTheme: ColorTheme) => {
  const root = document.documentElement;
  
  // Remove all theme classes
  root.classList.remove('theme-tokyo-night');
  
  // Add the selected theme class (default doesn't need a class)
  if (colorTheme === 'tokyo-night') {
    root.classList.add('theme-tokyo-night');
  }
};

export type UseThemeResult = {
  /** Current mode setting (light/dark/system) */
  mode: ThemeMode;
  /** Resolved mode after applying system preference */
  resolvedMode: 'light' | 'dark';
  /** Set the mode */
  setMode: (mode: ThemeMode) => void;
  /** Current color theme */
  colorTheme: ColorTheme;
  /** Set the color theme */
  setColorTheme: (theme: ColorTheme) => void;
  /** @deprecated Use mode instead */
  theme: ThemeMode;
  /** @deprecated Use resolvedMode instead */
  resolvedTheme: 'light' | 'dark';
  /** @deprecated Use setMode instead */
  setTheme: (theme: ThemeMode) => void;
};

export const useTheme = (): UseThemeResult => {
  const [mode, setModeState] = useState<ThemeMode>(getStoredMode);
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(getStoredColorTheme);
  const [resolvedMode, setResolvedMode] = useState<'light' | 'dark'>(() => {
    const initial = getStoredMode();
    return initial === 'system' ? getSystemTheme() : initial;
  });

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem(MODE_STORAGE_KEY, newMode);
    applyMode(newMode);
    setResolvedMode(newMode === 'system' ? getSystemTheme() : newMode);
  }, []);

  const setColorTheme = useCallback((newColorTheme: ColorTheme) => {
    setColorThemeState(newColorTheme);
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, newColorTheme);
    applyColorTheme(newColorTheme);
  }, []);

  // Apply mode and color theme on mount and listen for system preference changes
  useEffect(() => {
    applyMode(mode);
    applyColorTheme(colorTheme);
    setResolvedMode(mode === 'system' ? getSystemTheme() : mode);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      if (mode === 'system') {
        const newResolved = e.matches ? 'dark' : 'light';
        setResolvedMode(newResolved);
        if (newResolved === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [mode, colorTheme]);

  return {
    mode,
    resolvedMode,
    setMode,
    colorTheme,
    setColorTheme,
    // Deprecated aliases for backwards compatibility
    theme: mode,
    resolvedTheme: resolvedMode,
    setTheme: setMode,
  };
};
