/**
 * Same heading slug rules as the document view (Markdown # lines + slugify + disambiguation).
 * Used to validate `DocumentComment.anchorHeadingId` against `document.content`.
 */
function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u00C0-\u024F-]/g, '');
}

export function listHeadingSlugsFromMarkdown(md: string): Set<string> {
  const lines = md.split('\n');
  const slugs = new Map<string, number>();
  const ids = new Set<string>();
  const match = /^(#{1,6})\s+(.+)$/;
  for (const line of lines) {
    const m = line.match(match);
    if (!m) continue;
    const text = m[2].trim();
    const base = slugify(text) || 'heading';
    const n = (slugs.get(base) ?? 0) + 1;
    slugs.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    ids.add(id);
  }
  return ids;
}

export function isHeadingSlugInMarkdown(md: string, slug: string): boolean {
  return listHeadingSlugsFromMarkdown(md).has(slug);
}
