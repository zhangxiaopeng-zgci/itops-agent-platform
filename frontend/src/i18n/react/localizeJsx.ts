import { Fragment, isValidElement, ReactNode } from 'react';
import { getRuntimeLocale } from '../runtimeState';
import { hasChineseText, translateZhText } from '../domTranslations';

const LOCALIZED_ATTRIBUTES = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label']);
const SKIP_TEXT_TAGS = new Set(['script', 'style', 'code', 'pre', 'kbd', 'samp']);

function shouldLocalizeType(type: unknown): boolean {
  return typeof type === 'string' || type === Fragment;
}

function shouldSkipProps(type: unknown, props: Record<string, unknown>): boolean {
  if (props['data-i18n-skip'] === true || props['data-i18n-skip'] === 'true') return true;
  return typeof type === 'string' && SKIP_TEXT_TAGS.has(type);
}

function localizeString(value: string): string {
  if (getRuntimeLocale() !== 'en-US' || !hasChineseText(value)) return value;
  return translateZhText(value);
}

function localizeChild(child: ReactNode): ReactNode {
  if (typeof child === 'string') return localizeString(child);
  if (Array.isArray(child)) return child.map(localizeChild);
  return child;
}

export function localizeJsxProps(type: unknown, props: unknown): unknown {
  if (getRuntimeLocale() !== 'en-US') return props;
  if (!props || typeof props !== 'object' || !shouldLocalizeType(type)) return props;
  if (isValidElement(props)) return props;

  const record = props as Record<string, unknown>;
  if (shouldSkipProps(type, record)) return props;

  let changed = false;
  const next: Record<string, unknown> = { ...record };

  if ('children' in next) {
    const localizedChildren = localizeChild(next.children as ReactNode);
    if (localizedChildren !== next.children) {
      next.children = localizedChildren;
      changed = true;
    }
  }

  for (const attr of LOCALIZED_ATTRIBUTES) {
    const value = next[attr];
    if (typeof value === 'string' && hasChineseText(value)) {
      next[attr] = localizeString(value);
      changed = true;
    }
  }

  return changed ? next : props;
}
