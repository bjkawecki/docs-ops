import type { JSONContent } from '@tiptap/core';
import type { BlockDocumentV0, BlockNodeV0 } from '../api/document-types';

function newId(): string {
  return crypto.randomUUID();
}

function textLeaf(text: string): BlockNodeV0 {
  return { id: newId(), type: 'text', attrs: {}, meta: { text } };
}

/** Flachtet Kindknoten zu einem String (analog Backend `innerText`). */
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

function paragraphOurToTiptap(p: BlockNodeV0): JSONContent {
  const text = innerTextFromBlockNode(p);
  return {
    type: 'paragraph',
    attrs: { blockId: p.id },
    content: [{ type: 'text', text }],
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
      const text = innerTextFromBlockNode(block);
      return {
        type: 'heading',
        attrs: { level, blockId: block.id },
        content: [{ type: 'text', text }],
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
      return {
        type: 'paragraph',
        attrs: { blockId: block.id },
        content: [{ type: 'text', text }],
      };
    }
  }
}

export function blockDocumentToTiptapJson(doc: BlockDocumentV0): JSONContent {
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
          content: [{ type: 'text', text: '' }],
        },
      ],
    };
  }
  return { type: 'doc', content };
}

function tiptapParagraphToOur(node: JSONContent): BlockNodeV0 {
  const id = readBlockId(node.attrs);
  const t = pmInlineText(node.content);
  return {
    id,
    type: 'paragraph',
    content: [textLeaf(t)],
  };
}

function tiptapListItemToOur(node: JSONContent): BlockNodeV0 {
  const id = readBlockId(node.attrs);
  const inner = (node.content ?? []).map((c) => {
    if (c.type === 'paragraph') return tiptapParagraphToOur(c);
    return {
      id: newId(),
      type: 'paragraph',
      content: [textLeaf(pmInlineText(c.content))],
    };
  });
  return {
    id,
    type: 'list_item',
    content:
      inner.length > 0 ? inner : [{ id: newId(), type: 'paragraph', content: [textLeaf('')] }],
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
      const t = pmInlineText(node.content);
      return {
        id,
        type: 'heading',
        attrs: { level },
        content: [textLeaf(t)],
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
          content: [textLeaf(pmInlineText(node.content))],
        };
      }
      return null;
    }
  }
}

export function tiptapJsonToBlockDocument(json: JSONContent): BlockDocumentV0 {
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
  return { schemaVersion: 0, blocks };
}
