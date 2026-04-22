import { randomUUID } from 'node:crypto';
import type { BlockDocumentV0, BlockNode } from './blockSchema.js';

function textNode(text: string): BlockNode {
  return { id: randomUUID(), type: 'text', attrs: {}, meta: { text } };
}

function isFenceStart(line: string): boolean {
  return line.startsWith('```');
}

function isHeading(line: string): boolean {
  return /^(#{1,6})\s+\S/.test(line);
}

function isBullet(line: string): boolean {
  return /^[-*]\s+\S/.test(line);
}

/**
 * Minimal Markdown → Block-Dokument v0 (EPIC-2 / PR-2b).
 * Für Migration/Import; kein vollständiger CommonMark-Parser.
 * Unterstützt grob: Überschriften, Fließtext-Absätze, einfache `-`/`*`-Listen, fenced ``` code ```.
 */
export function markdownToBlockDocumentV0(markdown: string): BlockDocumentV0 {
  const md = markdown.replace(/\r\n/g, '\n');
  const lines = md.split('\n');
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    if (isFenceStart(line)) {
      const lang = line.slice(3).trim();
      i += 1;
      const body: string[] = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (cur === undefined) break;
        if (isFenceStart(cur)) break;
        body.push(cur);
        i += 1;
      }
      if (i < lines.length && isFenceStart(lines[i] ?? '')) i += 1;
      const attrs: Record<string, unknown> = {};
      if (lang.length > 0) attrs.lang = lang;
      blocks.push({
        id: randomUUID(),
        type: 'code',
        attrs,
        content: [textNode(body.join('\n'))],
      });
      continue;
    }

    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      const hashes = hm[1];
      const rest = hm[2];
      if (hashes !== undefined && rest !== undefined) {
        blocks.push({
          id: randomUUID(),
          type: 'heading',
          attrs: { level: hashes.length },
          content: [textNode(rest.trim())],
        });
      }
      i += 1;
      continue;
    }

    if (isBullet(line)) {
      const items: BlockNode[] = [];
      while (i < lines.length) {
        const row = lines[i];
        if (row === undefined) break;
        const m = row.match(/^[-*]\s+(.*)$/);
        if (!m) break;
        const itemText = m[1]?.trim() ?? '';
        items.push({
          id: randomUUID(),
          type: 'list_item',
          content: [
            {
              id: randomUUID(),
              type: 'paragraph',
              content: [textNode(itemText)],
            },
          ],
        });
        i += 1;
      }
      blocks.push({ id: randomUUID(), type: 'bullet_list', content: items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (l === undefined) break;
      if (l.trim() === '') break;
      if (isFenceStart(l) || isHeading(l) || isBullet(l)) break;
      para.push(l);
      i += 1;
    }
    blocks.push({
      id: randomUUID(),
      type: 'paragraph',
      content: [textNode(para.join('\n'))],
    });
  }

  if (blocks.length === 0) {
    blocks.push({ id: randomUUID(), type: 'paragraph', content: [textNode('')] });
  }

  return { schemaVersion: 0, blocks };
}
