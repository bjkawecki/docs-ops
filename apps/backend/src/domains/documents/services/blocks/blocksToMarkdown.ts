import type { BlockDocument, BlockNode } from './blockSchema.js';

function textFromMeta(node: BlockNode): string {
  const t = node.meta?.text;
  return typeof t === 'string' ? t : '';
}

function formatInlineTextNode(node: BlockNode): string {
  const text = textFromMeta(node);
  if (node.type !== 'text') return text;
  const rawMarks = node.meta?.marks;
  if (!Array.isArray(rawMarks) || rawMarks.length === 0) return text;
  const marks = new Set(
    rawMarks.filter((m): m is string => m === 'bold' || m === 'italic' || m === 'code')
  );
  let out = text;
  if (marks.has('code')) out = `\`${out}\``;
  if (marks.has('bold')) out = `**${out}**`;
  if (marks.has('italic')) out = `*${out}*`;
  return out;
}

/** Flachtet Kindknoten zu einem String (für heading/paragraph/code-Inhalt). */
function innerText(node: BlockNode): string {
  if (node.type === 'text') return formatInlineTextNode(node);
  return (node.content ?? []).map(innerText).join('');
}

/**
 * Block-Dokument v0 → Markdown (EPIC-2 / PR-2b).
 * Spiegelbild zu {@link markdownToBlockDocumentV0}; für Export/Pandoc-Pipeline.
 */
export function blockDocumentV0ToMarkdown(doc: BlockDocument): string {
  return doc.blocks
    .map(blockNodeToMarkdown)
    .filter((s) => s.length > 0)
    .join('\n\n');
}

function blockNodeToMarkdown(node: BlockNode): string {
  switch (node.type) {
    case 'text':
      return textFromMeta(node);
    case 'heading': {
      const raw = node.attrs?.level;
      const level =
        typeof raw === 'number' && Number.isFinite(raw)
          ? Math.min(6, Math.max(1, Math.trunc(raw)))
          : 1;
      return `${'#'.repeat(level)} ${innerText(node)}`.trimEnd();
    }
    case 'paragraph':
      return innerText(node);
    case 'code': {
      const lang = typeof node.attrs?.lang === 'string' ? node.attrs.lang : '';
      const body = innerText(node);
      return `\`\`\`${lang}\n${body}\n\`\`\``;
    }
    case 'list_item':
      return innerText(node);
    case 'bullet_list':
      return (node.content ?? [])
        .map((item) => {
          const line = blockNodeToMarkdown(item);
          return `- ${line.replace(/\n/g, '\n  ')}`;
        })
        .join('\n');
    default:
      return innerText(node);
  }
}
