import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ThemeType = 'dark' | 'light';
export type BackgroundStyle = 'graphite' | 'steel' | 'amber';

interface ThemeContextType {
  theme: ThemeType;
  backgroundStyle: BackgroundStyle;
  toggleTheme: () => void;
  setBackgroundStyle: (style: BackgroundStyle) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeType>(() => {
    const saved = localStorage.getItem('theme') as ThemeType;
    return saved || 'dark';
  });
  const [backgroundStyle, setBackgroundStyleState] = useState<BackgroundStyle>(() => {
    const saved = localStorage.getItem('backgroundStyle') as BackgroundStyle;
    return ['graphite', 'steel', 'amber'].includes(saved) ? saved : 'graphite';
  });

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
    localStorage.setItem('theme', theme);
    localStorage.setItem('backgroundStyle', backgroundStyle);
  }, [theme, backgroundStyle]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setBackgroundStyle = (style: BackgroundStyle) => {
    setBackgroundStyleState(style);
  };

  return (
    <ThemeContext.Provider value={{ theme, backgroundStyle, toggleTheme, setBackgroundStyle }}>
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
