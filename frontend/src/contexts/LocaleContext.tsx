import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { messages, type MessageKey } from '../i18n/messages';
import { setRuntimeLocale } from '../i18n/runtimeState';
import type { Locale } from '../i18n/types';

export type { Locale } from '../i18n/types';
export type { MessageKey } from '../i18n/messages';

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

function getInitialLocale(): Locale {
  const saved = localStorage.getItem('locale');
  if (saved === 'zh-CN' || saved === 'en-US') return saved;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  setRuntimeLocale(locale);

  useEffect(() => {
    setRuntimeLocale(locale);
    localStorage.setItem('locale', locale);
    document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en';
  }, [locale]);

  const value = useMemo<LocaleContextType>(() => ({
    locale,
    setLocale: setLocaleState,
    t: (key, values) => {
      let text: string = messages[locale][key] || messages['zh-CN'][key] || key;
      if (values) {
        Object.entries(values).forEach(([name, replacement]) => {
          text = text.split(`{${name}}`).join(String(replacement));
        });
      }
      return text;
    },
  }), [locale]);

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}
