import { useEffect } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { hasChineseText, translateZhText } from '../../i18n/domTranslations';

const SKIP_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'KBD', 'SAMP']);
const SKIP_ATTRIBUTE_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'KBD', 'SAMP']);
const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'];
const originalText = new WeakMap<Text, string>();
const translatedAttributeNames = ['data-i18n-original-placeholder', 'data-i18n-original-title', 'data-i18n-original-aria-label', 'data-i18n-original-alt'];

function shouldSkipElement(element: Element | null, skipTags: Set<string>): boolean {
  let current = element;
  while (current) {
    if (skipTags.has(current.tagName)) return true;
    if (current.getAttribute('data-i18n-skip') === 'true') return true;
    current = current.parentElement;
  }
  return false;
}

function translateTextNode(node: Text, locale: string) {
  if (shouldSkipElement(node.parentElement, SKIP_TEXT_TAGS)) return;

  if (locale === 'en-US') {
    const current = node.nodeValue || '';
    const previousSource = originalText.get(node);
    const source = hasChineseText(current) && current !== previousSource
      ? current
      : previousSource || current;
    if (!originalText.has(node)) originalText.set(node, source);
    if (source !== previousSource) originalText.set(node, source);
    if (hasChineseText(source)) {
      const translated = translateZhText(source);
      if (node.nodeValue !== translated) {
        node.nodeValue = translated;
      }
    }
    return;
  }

  const source = originalText.get(node);
  if (source !== undefined && node.nodeValue !== source) {
    node.nodeValue = source;
  }
}

function translateAttributes(element: Element, locale: string) {
  if (shouldSkipElement(element, SKIP_ATTRIBUTE_TAGS)) return;

  for (const attr of TRANSLATABLE_ATTRIBUTES) {
    const current = element.getAttribute(attr);
    const originalAttr = `data-i18n-original-${attr}`;

    if (locale === 'en-US') {
      const source = element.getAttribute(originalAttr) || current;
      if (!source) continue;
      if (!element.hasAttribute(originalAttr)) {
        element.setAttribute(originalAttr, source);
      }
      if (hasChineseText(source)) {
        const translated = translateZhText(source);
        if (current !== translated) {
          element.setAttribute(attr, translated);
        }
      }
      continue;
    }

    const source = element.getAttribute(originalAttr);
    if (source !== null) {
      element.setAttribute(attr, source);
      element.removeAttribute(originalAttr);
    }
  }

  if (locale !== 'en-US') {
    translatedAttributeNames.forEach((name) => element.removeAttribute(name));
  }
}

function translateTree(root: ParentNode, locale: string) {
  if (root instanceof Element) {
    translateAttributes(root, locale);
  }

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE && shouldSkipElement(node as Element, SKIP_TEXT_TAGS)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      translateTextNode(node as Text, locale);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      translateAttributes(node as Element, locale);
    }
    node = walker.nextNode();
  }
}

export default function LocaleDomTranslator() {
  const { locale } = useLocale();

  useEffect(() => {
    const run = () => translateTree(document.body, locale);
    const runSoon = () => window.requestAnimationFrame(run);
    const timeouts = [0, 50, 150, 350, 800, 1500, 3000].map((delay) => window.setTimeout(run, delay));
    runSoon();

    const handleUserEvent = () => {
      window.setTimeout(run, 0);
      window.setTimeout(run, 120);
      window.setTimeout(run, 500);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleUserEvent();
    };

    const observer = new MutationObserver((mutations) => {
      const seen = new Set<Node>();
      window.requestAnimationFrame(() => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'characterData') {
            const node = mutation.target;
            if (!seen.has(node) && node.nodeType === Node.TEXT_NODE) {
              seen.add(node);
              translateTextNode(node as Text, locale);
            }
          }

          if (mutation.type === 'attributes' && mutation.target instanceof Element) {
            translateAttributes(mutation.target, locale);
          }

          mutation.addedNodes.forEach((node) => {
            if (seen.has(node)) return;
            seen.add(node);
            if (node.nodeType === Node.TEXT_NODE) {
              translateTextNode(node as Text, locale);
            } else if (node instanceof Element) {
              translateTree(node, locale);
            }
          });
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES,
    });

    window.addEventListener('click', handleUserEvent, true);
    window.addEventListener('focusin', handleUserEvent, true);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      observer.disconnect();
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
      window.removeEventListener('click', handleUserEvent, true);
      window.removeEventListener('focusin', handleUserEvent, true);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [locale]);

  return null;
}
