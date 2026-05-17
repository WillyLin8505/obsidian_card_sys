import React from 'react';
import { CardFontSizes, Config } from '../types/note';

export const DEFAULT_CARD_FONT_SIZES: CardFontSizes = {
  title: 18,
  h1: 16,
  h2: 14,
  h3: 13,
  h4: 12,
  body: 12,
  metadata: 11,
};

export function getCardFontSizes(config: Config): CardFontSizes {
  return { ...DEFAULT_CARD_FONT_SIZES, ...(config.cardFontSizes || {}) };
}

type FC = (props: { children?: React.ReactNode }) => React.ReactElement;

export function makeMarkdownComponents(sizes: CardFontSizes): Record<string, FC> {
  const el = (tag: string, style: React.CSSProperties): FC =>
    ({ children }) => React.createElement(tag, { style }, children);

  return {
    h1: el('h1', { fontSize: `${sizes.h1}px`, fontWeight: 'bold', lineHeight: '1.3', margin: '2px 0' }),
    h2: el('h2', { fontSize: `${sizes.h2}px`, fontWeight: 'bold', lineHeight: '1.3', margin: '2px 0' }),
    h3: el('h3', { fontSize: `${sizes.h3}px`, fontWeight: '600', lineHeight: '1.3', margin: '2px 0' }),
    h4: el('h4', { fontSize: `${sizes.h4}px`, fontWeight: '600', lineHeight: '1.3', margin: '2px 0' }),
    p:  el('p',  { fontSize: `${sizes.body}px`, lineHeight: '1.4', margin: '1px 0' }),
    li: el('li', { fontSize: `${sizes.body}px`, lineHeight: '1.4' }),
  };
}
