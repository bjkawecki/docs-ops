import { Box, Button, Code, Group, List, Stack, Text, Title } from '@mantine/core';
import { Fragment, type ReactNode } from 'react';
import type { BlockDocumentV0, BlockNodeV0 } from '../../api/document-types';
import { ensureUniqueBlockIdsInDocument } from '../../lib/blockDocumentTiptap';
import {
  getBlockDocumentHeadingData,
  nodeText,
} from '../../pages/documentPage/blockDocumentHeadings';

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

function renderNode(node: BlockNodeV0, anchorMap: ReadonlyMap<string, string>): ReactNode {
  switch (node.type) {
    case 'heading': {
      const label = nodeText(node).trim();
      const display = label.length > 0 ? label : '(Untitled)';
      const anchorId = anchorMap.get(node.id);
      const order = headingOrder(node.attrs);
      return (
        <Title order={order} id={anchorId}>
          {display}
        </Title>
      );
    }
    case 'paragraph': {
      const t = walkNode(node);
      if (!t.trim()) return null;
      return (
        <Text size="sm" c="var(--mantine-color-text)" style={{ whiteSpace: 'pre-wrap' }}>
          {t}
        </Text>
      );
    }
    case 'bullet_list': {
      const items = node.content ?? [];
      if (items.length === 0) return null;
      return (
        <List type="unordered" size="sm" spacing="xs" withPadding>
          {items.map((item) => (
            <List.Item key={item.id}>{renderNode(item, anchorMap)}</List.Item>
          ))}
        </List>
      );
    }
    case 'list_item': {
      const parts = node.content ?? [];
      if (parts.length === 0) return null;
      return (
        <Stack gap={4}>
          {parts.map((c) => (
            <Fragment key={c.id}>{renderNode(c, anchorMap)}</Fragment>
          ))}
        </Stack>
      );
    }
    case 'code': {
      const body = walkNode(node);
      return (
        <Code block w="100%" style={{ whiteSpace: 'pre-wrap' }}>
          {body}
        </Code>
      );
    }
    case 'text': {
      const t = node.meta?.text;
      return typeof t === 'string' && t.length > 0 ? (
        <Text size="sm" component="span" style={{ whiteSpace: 'pre-wrap' }}>
          {t}
        </Text>
      ) : null;
    }
    default: {
      const t = walkNode(node);
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
  canSuggest?: boolean;
  onSuggestChange?: (blockId: string) => void;
};

const SUGGESTABLE_BLOCK_TYPES = new Set([
  'heading',
  'paragraph',
  'code',
  'bullet_list',
  'list_item',
]);

/** Lesevorschau aus Blocks – Überschriften inkl. Anker-IDs (TOC / Kommentar-Slugs). */
export function DocumentBlocksPreview({ title, doc, canSuggest = false, onSuggestChange }: Props) {
  if (doc == null || doc.blocks.length === 0) return null;
  const normalizedDoc = ensureUniqueBlockIdsInDocument(doc);
  const text = blockDocumentToPlainPreview(normalizedDoc);
  if (!text.trim()) return null;
  const { anchorIdByBlockNodeId } = getBlockDocumentHeadingData(normalizedDoc);
  return (
    <Box mb="md" className="document-content">
      <Text size="xs" tt="uppercase" fw={600} c="dimmed" mb="xs">
        {title}
      </Text>
      <Stack gap="md">
        {normalizedDoc.blocks.map((block) => {
          const el = renderNode(block, anchorIdByBlockNodeId);
          if (el == null) return null;
          const showSuggest =
            canSuggest && onSuggestChange != null && SUGGESTABLE_BLOCK_TYPES.has(block.type);
          return (
            <Box key={block.id}>
              {showSuggest ? (
                <Group align="flex-start" justify="space-between" wrap="nowrap" gap="sm">
                  <Box style={{ flex: 1, minWidth: 0 }}>{el}</Box>
                  <Button
                    size="compact-xs"
                    variant="light"
                    onClick={() => onSuggestChange(block.id)}
                  >
                    Suggest change
                  </Button>
                </Group>
              ) : (
                el
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
