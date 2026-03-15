import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
    applyThemeMode,
    getInitialThemeMode,
    getStoredThemeMode,
    ThemeModeContext,
    type ThemeMode,
    type ThemeModeContextValue,
} from './themeMode';

export const ThemeModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [themeMode, setThemeModeState] = useState<ThemeMode>(getInitialThemeMode);

    useLayoutEffect(() => {
        applyThemeMode(themeMode);
    }, [themeMode]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem('gx-theme-mode', themeMode);
    }, [themeMode]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        if (getStoredThemeMode()) {
            return;
        }

        const handleChange = (event: MediaQueryListEvent) => {
            setThemeModeState(event.matches ? 'dark' : 'light');
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    const contextValue = useMemo<ThemeModeContextValue>(() => ({
        themeMode,
        isDark: themeMode === 'dark',
        setThemeMode: setThemeModeState,
        toggleTheme: () => {
            setThemeModeState((currentMode) => (currentMode === 'dark' ? 'light' : 'dark'));
        },
    }), [themeMode]);

    return (
        <ThemeModeContext.Provider value={contextValue}>
            {children}
        </ThemeModeContext.Provider>
    );
};
