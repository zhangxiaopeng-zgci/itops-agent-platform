import type { Locale } from '../contexts/LocaleContext';

function getInitialRuntimeLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-CN';
  const saved = window.localStorage.getItem('locale');
  if (saved === 'zh-CN' || saved === 'en-US') return saved;
  return window.navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

let runtimeLocale: Locale = getInitialRuntimeLocale();

export function setRuntimeLocale(locale: Locale) {
  runtimeLocale = locale;
}

export function getRuntimeLocale(): Locale {
  return runtimeLocale;
}
