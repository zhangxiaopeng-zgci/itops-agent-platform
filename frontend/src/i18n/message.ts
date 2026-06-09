import { getRuntimeLocale } from './runtimeState';
import { hasChineseText, translateZhText } from './domTranslations';

export function localizeMessage(message: unknown): string {
  const text = String(message ?? '');
  if (getRuntimeLocale() !== 'en-US' || !hasChineseText(text)) return text;
  return translateZhText(text);
}
