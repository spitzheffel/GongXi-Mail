import { createContext } from 'react';

export type ThemeMode = 'dark' | 'light';

export interface ThemeModeContextValue {
    themeMode: ThemeMode;
    isDark: boolean;
    setThemeMode: (mode: ThemeMode) => void;
    toggleTheme: () => void;
}

export const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export const getStoredThemeMode = (): ThemeMode | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    const storedValue = window.localStorage.getItem('gx-theme-mode');
    return storedValue === 'dark' || storedValue === 'light' ? storedValue : null;
};

export const getInitialThemeMode = (): ThemeMode => {
    const storedValue = getStoredThemeMode();
    if (storedValue) {
        return storedValue;
    }

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }

    return 'dark';
};

export const applyThemeMode = (themeMode: ThemeMode) => {
    if (typeof document === 'undefined') {
        return;
    }

    document.documentElement.dataset.gxTheme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    document.body.dataset.gxTheme = themeMode;
};
