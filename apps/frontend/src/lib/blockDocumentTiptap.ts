import type { JSONContent } from '@tiptap/core';
import type { BlockDocument, BlockNodeV0 } from '../api/document-types';
import { randomId } from './randomId.js';

type InlineMark = 'bold' | 'italic' | 'code';

function newId(): string {
  return randomId();
}

function readMarks(meta: Record<string, unknown> | undefined): InlineMark[] {
  const raw = meta?.marks;
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is InlineMark => m === 'bold' || m === 'italic' || m === 'code');
}

function textLeaf(text: string, marks?: InlineMark[]): BlockNodeV0 {
  return {
    id: newId(),
    type: 'text',
    attrs: {},
    meta: marks?.length ? { text, marks } : { text },
  };
}

/** Flachtet Kindknoten zu einem String (analog Backend `innerText`, ohne Markup). */
export function innerTextFromBlockNode(node: BlockNodeV0): string {
  if (node.type === 'text') {
    const t = node.meta?.text;
    return typeof t === 'string' ? t : '';
  }
  return (node.content ?? []).map(innerTextFromBlockNode).join('');
}

function pmInlineText(content: JSONContent[] | undefined): string {
  if (!content?.length) return '';
  let s = '';
  for (const c of content) {
    if (c.type === 'text' && typeof c.text === 'string') s += c.text;
    else if (c.type === 'hardBreak') s += '\n';
    else if (c.content?.length) s += pmInlineText(c.content);
  }
  return s;
}

function readBlockId(attrs: Record<string, unknown> | undefined): string {
  const raw = attrs?.blockId;
  return typeof raw === 'string' && raw.length > 0 ? raw : newId();
}

function pmInlineToTextLeaves(content: JSONContent[] | undefined): BlockNodeV0[] {
  const leaves: BlockNodeV0[] = [];
  for (const c of content ?? []) {
    if (c.type === 'text' && typeof c.text === 'string') {
      const marks: InlineMark[] = [];
      for (const mark of c.marks ?? []) {
        if (mark.type === 'bold') marks.push('bold');
        if (mark.type === 'italic') marks.push('italic');
        if (mark.type === 'code') marks.push('code');
      }
      leaves.push(textLeaf(c.text, marks));
    } else if (c.type === 'hardBreak') {
      leaves.push(textLeaf('\n'));
    } else if (c.content?.length) {
      leaves.push(...pmInlineToTextLeaves(c.content));
    }
  }
  return leaves.length > 0 ? leaves : [textLeaf('')];
}

function blockInlineContentToTiptap(content: BlockNodeV0[] | undefined): JSONContent[] {
  const out: JSONContent[] = [];
  for (const leaf of content ?? []) {
    if (leaf.type !== 'text') continue;
    const text = innerTextFromBlockNode(leaf);
    if (!text) continue;
    const marks = readMarks(leaf.meta);
    const pmMarks = marks.map((m) => ({ type: m }));
    out.push({ type: 'text', text, ...(pmMarks.length ? { marks: pmMarks } : {}) });
  }
  return out;
}

function paragraphOurToTiptap(p: BlockNodeV0): JSONContent {
  return {
    type: 'paragraph',
    attrs: { blockId: p.id },
    content: blockInlineContentToTiptap(p.content),
  };
}

function listItemOurToTiptap(item: BlockNodeV0): JSONContent {
  const paras = (item.content ?? []).filter((c) => c.type === 'paragraph');
  const content: JSONContent[] =
    paras.length > 0
      ? paras.map((p) => paragraphOurToTiptap(p))
      : [paragraphOurToTiptap({ id: newId(), type: 'paragraph', content: [textLeaf('')] })];
  return {
    type: 'listItem',
    attrs: { blockId: item.id },
    content,
  };
}

function ourTopLevelBlockToTiptap(block: BlockNodeV0): JSONContent | null {
  switch (block.type) {
    case 'heading': {
      const raw = block.attrs?.level;
      const level =
        typeof raw === 'number' && Number.isFinite(raw)
          ? Math.min(6, Math.max(1, Math.trunc(raw)))
          : 1;
      return {
        type: 'heading',
        attrs: { level, blockId: block.id },
        content: blockInlineContentToTiptap(block.content),
      };
    }
    case 'paragraph':
      return paragraphOurToTiptap(block);
    case 'code': {
      const lang = typeof block.attrs?.lang === 'string' ? block.attrs.lang : '';
      const text = innerTextFromBlockNode(block);
      return {
        type: 'codeBlock',
        attrs: {
          language: lang.length > 0 ? lang : null,
          blockId: block.id,
        },
        content: text ? [{ type: 'text', text }] : [],
      };
    }
    case 'bullet_list': {
      const items = (block.content ?? []).filter((c) => c.type === 'list_item');
      return {
        type: 'bulletList',
        attrs: { blockId: block.id },
        content: items.map((item) => listItemOurToTiptap(item)),
      };
    }
    default: {
      const text = innerTextFromBlockNode(block);
      if (!text) {
        return {
          type: 'paragraph',
          attrs: { blockId: block.id },
          content: [],
        };
      }
      return {
        type: 'paragraph',
        attrs: { blockId: block.id },
        content: blockInlineContentToTiptap(block.content) || [{ type: 'text', text }],
      };
    }
  }
}

export function blockDocumentToTiptapJson(doc: BlockDocument): JSONContent {
  const content = doc.blocks
    .map(ourTopLevelBlockToTiptap)
    .filter((n): n is JSONContent => n != null);
  if (content.length === 0) {
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: newId() },
          content: [],
        },
      ],
    };
  }
  return { type: 'doc', content };
}

function tiptapParagraphToOur(node: JSONContent): BlockNodeV0 {
  const id = readBlockId(node.attrs);
  const leaves = pmInlineToTextLeaves(node.content);
  return {
    id,
    type: 'paragraph',
    content: leaves,
  };
}

function tiptapListItemToOur(node: JSONContent): BlockNodeV0 {
  const id = readBlockId(node.attrs);
  const inner = (node.content ?? []).map((c) => {
    if (c.type === 'paragraph') return tiptapParagraphToOur(c);
    return {
      id: newId(),
      type: 'paragraph',
      content: pmInlineToTextLeaves(c.content),
    };
  });
  return {
    id,
    type: 'list_item',
    content:
      inner.length > 0 ? inner : [{ id: newId(), type: 'paragraph', content: [textLeaf('')] }],
  };
}

function blockDocumentUsesInlineMarks(doc: BlockDocument): boolean {
  if (doc.schemaVersion === 1) return true;
  const walk = (node: BlockNodeV0): boolean => {
    if (node.type === 'text') {
      const marks = node.meta?.marks;
      return Array.isArray(marks) && marks.length > 0;
    }
    return (node.content ?? []).some(walk);
  };
  return doc.blocks.some(walk);
}

export function ensureUniqueBlockIdsInDocument(doc: BlockDocument): BlockDocument {
  const seen = new Set<string>();

  const walk = (node: BlockNodeV0): BlockNodeV0 => {
    let id = node.id;
    if (!id || seen.has(id)) {
      id = newId();
    }
    seen.add(id);
    const content = node.content?.map(walk);
    return content != null ? { ...node, id, content } : { ...node, id };
  };

  return {
    schemaVersion: doc.schemaVersion,
    blocks: doc.blocks.map(walk),
  };
}

function tiptapTopLevelToOur(node: JSONContent): BlockNodeV0 | null {
  switch (node.type) {
    case 'heading': {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      const id = readBlockId(attrs);
      const raw = attrs?.level;
      const level =
        typeof raw === 'number' && Number.isFinite(raw)
          ? Math.min(6, Math.max(1, Math.trunc(raw)))
          : 1;
      return {
        id,
        type: 'heading',
        attrs: { level },
        content: pmInlineToTextLeaves(node.content),
      };
    }
    case 'paragraph':
      return tiptapParagraphToOur(node);
    case 'codeBlock': {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      const id = readBlockId(attrs);
      const langRaw = attrs?.language;
      const lang = typeof langRaw === 'string' && langRaw.length > 0 ? langRaw : '';
      const t = pmInlineText(node.content);
      return {
        id,
        type: 'code',
        attrs: lang ? { lang } : {},
        content: [textLeaf(t)],
      };
    }
    case 'bulletList': {
      const id = readBlockId(node.attrs);
      const items = (node.content ?? [])
        .filter((c) => c.type === 'listItem')
        .map((c) => tiptapListItemToOur(c));
      return { id, type: 'bullet_list', content: items };
    }
    default: {
      if (node.content?.length) {
        return {
          id: readBlockId(node.attrs),
          type: 'paragraph',
          content: pmInlineToTextLeaves(node.content),
        };
      }
      return null;
    }
  }
}

export function tiptapJsonToBlockDocument(json: JSONContent): BlockDocument {
  if (json.type !== 'doc' || !json.content?.length) {
    return {
      schemaVersion: 0,
      blocks: [{ id: newId(), type: 'paragraph', content: [textLeaf('')] }],
    };
  }
  const blocks: BlockNodeV0[] = [];
  for (const node of json.content) {
    const b = tiptapTopLevelToOur(node);
    if (b) blocks.push(b);
  }
  if (blocks.length === 0) {
    return {
      schemaVersion: 0,
      blocks: [{ id: newId(), type: 'paragraph', content: [textLeaf('')] }],
    };
  }
  const deduped = ensureUniqueBlockIdsInDocument({ schemaVersion: 0, blocks });
  return blockDocumentUsesInlineMarks(deduped)
    ? { schemaVersion: 1, blocks: deduped.blocks }
    : deduped;
}
