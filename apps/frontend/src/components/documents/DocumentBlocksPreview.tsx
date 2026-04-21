import { Box, Text } from '@mantine/core';
import type { BlockDocumentV0, BlockNodeV0 } from '../../api/document-types';

function walkNode(node: BlockNodeV0): string {
  if (node.type === 'text') {
    const t = node.meta?.text;
    return typeof t === 'string' ? t : '';
  }
  if (!node.content?.length) return '';
  const sep = node.type === 'paragraph' || node.type === 'heading' ? ' ' : '\n';
  return node.content
    .map(walkNode)
    .filter((s) => s.length > 0)
    .join(sep);
}

/** Fließtext aus Block-Baum (Lesevorschau ohne Markdown). */
export function blockDocumentToPlainPreview(doc: BlockDocumentV0): string {
  return doc.blocks
    .map(walkNode)
    .filter((s) => s.length > 0)
    .join('\n\n');
}

type Props = {
  title: string;
  doc: BlockDocumentV0 | null;
};

/** Kompakte Vorschau aus Blocks (EPIC-8 / PR-8d). */
export function DocumentBlocksPreview({ title, doc }: Props) {
  if (doc == null || doc.blocks.length === 0) return null;
  const text = blockDocumentToPlainPreview(doc);
  if (!text.trim()) return null;
  return (
    <Box mb="md">
      <Text size="xs" tt="uppercase" fw={600} c="dimmed" mb="xs">
        {title}
      </Text>
      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
        {text}
      </Text>
    </Box>
  );
}
