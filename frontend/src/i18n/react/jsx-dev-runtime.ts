import {
  Fragment,
  jsxDEV as reactJsxDEV,
} from 'react/jsx-dev-runtime';
import { localizeJsxProps } from './localizeJsx';

export { Fragment };

export function jsxDEV(
  type: any,
  props: unknown,
  key: string | undefined,
  isStaticChildren: boolean,
  source: any,
  self: any
) {
  return reactJsxDEV(type, localizeJsxProps(type, props), key, isStaticChildren, source, self);
}
