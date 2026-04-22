import type { CSSProperties } from 'react';

export const PAGE_SIZE = 10;
export const LS_KEY_PREFIX = 'docsops.documentComments.open.';
export const TOGGLE_STRIP_WIDTH = 32;
export const WIDTH_OPEN = 300;
export const WIDTH_CLOSED = 48;
export const COMMENT_META_ICON_SIZE = 16;
export const COMMENT_META_COUNT_TEXT_STYLE: CSSProperties = {
  lineHeight: 1,
  whiteSpace: 'nowrap',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums',
};

export function commentsInfiniteQueryKey(documentId: string) {
  return ['documents', documentId, 'comments', 'infinite', PAGE_SIZE] as const;
}

export function headingLabel(
  headings: { id: string; text: string }[],
  slug: string | null | undefined
) {
  if (slug == null || slug === '') return null;
  const h = headings.find((x) => x.id === slug);
  return h?.text ?? slug;
}
