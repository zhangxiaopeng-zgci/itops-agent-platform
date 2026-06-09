import {
  Fragment,
  jsx as reactJsx,
  jsxs as reactJsxs,
} from 'react/jsx-runtime';
import { localizeJsxProps } from './localizeJsx';

export { Fragment };

export function jsx(type: any, props: unknown, key?: string) {
  return reactJsx(type, localizeJsxProps(type, props), key);
}

export function jsxs(type: any, props: unknown, key?: string) {
  return reactJsxs(type, localizeJsxProps(type, props), key);
}
