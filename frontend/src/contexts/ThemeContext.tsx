import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ThemeType = 'dark' | 'light';
export type ThemeMode = 'system' | 'dark' | 'light';
export type BackgroundStyle = 'carbon' | 'slate' | 'moss';

interface ThemeContextType {
  theme: ThemeType;
  themeMode: ThemeMode;
  backgroundStyle: BackgroundStyle;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setBackgroundStyle: (style: BackgroundStyle) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const savedMode = localStorage.getItem('themeMode') as ThemeMode;
    if (['system', 'dark', 'light'].includes(savedMode)) {
      return savedMode;
    }
    const legacyTheme = localStorage.getItem('theme') as ThemeType;
    return legacyTheme === 'light' || legacyTheme === 'dark' ? legacyTheme : 'system';
  });
  const [systemTheme, setSystemTheme] = useState<ThemeType>(() => (
    window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  ));
  const [backgroundStyle, setBackgroundStyleState] = useState<BackgroundStyle>(() => {
    const saved = localStorage.getItem('backgroundStyle');
    if (saved === 'steel') return 'slate';
    if (saved === 'graphite' || saved === 'amber') return 'carbon';
    return ['carbon', 'slate', 'moss'].includes(saved || '') ? saved as BackgroundStyle : 'carbon';
  });
  const theme: ThemeType = themeMode === 'system' ? systemTheme : themeMode;

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!media) return;

    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'light' : 'dark');
    };

    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-background', backgroundStyle);
    if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
      document.body.style.background = '#f8fafc';
    } else {
      root.removeAttribute('data-theme');
      document.body.style.background = 'var(--color-background)';
    }
    localStorage.setItem('themeMode', themeMode);
    localStorage.setItem('theme', theme);
    localStorage.setItem('backgroundStyle', backgroundStyle);
  }, [theme, themeMode, backgroundStyle]);

  const toggleTheme = () => {
    setThemeModeState(theme === 'dark' ? 'light' : 'dark');
  };

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
  };

  const setBackgroundStyle = (style: BackgroundStyle) => {
    setBackgroundStyleState(style);
  };

  return (
    <ThemeContext.Provider value={{ theme, themeMode, backgroundStyle, toggleTheme, setThemeMode, setBackgroundStyle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
