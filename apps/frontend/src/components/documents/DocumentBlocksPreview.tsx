import { Box, Code, List, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
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

function headingOrder(attrs: Record<string, unknown> | undefined): 1 | 2 | 3 | 4 | 5 | 6 {
  const raw = attrs?.level;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.trunc(raw);
    if (n >= 1 && n <= 6) return n as 1 | 2 | 3 | 4 | 5 | 6;
  }
  return 2;
}

/** Ein Top-Level-Block für die Lesevorschau (Überschriften sichtbar absetzen). */
function renderPreviewBlock(block: BlockNodeV0): ReactNode {
  switch (block.type) {
    case 'heading': {
      const order = headingOrder(block.attrs);
      const label = walkNode(block);
      if (!label.trim()) return null;
      return <Title order={order}>{label}</Title>;
    }
    case 'paragraph': {
      const t = walkNode(block);
      if (!t.trim()) return null;
      return (
        <Text size="sm" c="var(--mantine-color-text)" style={{ whiteSpace: 'pre-wrap' }}>
          {t}
        </Text>
      );
    }
    case 'bullet_list': {
      const items = block.content ?? [];
      if (items.length === 0) return null;
      return (
        <List type="unordered" size="sm" spacing="xs" withPadding>
          {items.map((item) => (
            <List.Item key={item.id}>
              <Text size="sm" component="span" style={{ whiteSpace: 'pre-wrap' }}>
                {walkNode(item)}
              </Text>
            </List.Item>
          ))}
        </List>
      );
    }
    case 'code': {
      const body = walkNode(block);
      return (
        <Code block w="100%" style={{ whiteSpace: 'pre-wrap' }}>
          {body}
        </Code>
      );
    }
    default: {
      const t = walkNode(block);
      if (!t.trim()) return null;
      return (
        <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
          {t}
        </Text>
      );
    }
  }
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

/** Lesevorschau aus Blocks — Überschriften und Listen werden typografisch unterschieden. */
export function DocumentBlocksPreview({ title, doc }: Props) {
  if (doc == null || doc.blocks.length === 0) return null;
  const text = blockDocumentToPlainPreview(doc);
  if (!text.trim()) return null;
  return (
    <Box mb="md">
      <Text size="xs" tt="uppercase" fw={600} c="dimmed" mb="xs">
        {title}
      </Text>
      <Stack gap="md">
        {doc.blocks.map((block) => {
          const el = renderPreviewBlock(block);
          if (el == null) return null;
          return <Box key={block.id}>{el}</Box>;
        })}
      </Stack>
    </Box>
  );
}
