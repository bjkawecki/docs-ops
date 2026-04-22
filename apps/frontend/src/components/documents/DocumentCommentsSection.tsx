import { ActionIcon, Box, Group, ScrollArea, Text, useMantineTheme } from '@mantine/core';
import {
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconMessage,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { DocumentCommentsListBody } from './documentComments/DocumentCommentsListBody.js';
import {
  COMMENT_META_COUNT_TEXT_STYLE,
  COMMENT_META_ICON_SIZE,
  LS_KEY_PREFIX,
  TOGGLE_STRIP_WIDTH,
  WIDTH_CLOSED,
  WIDTH_OPEN,
} from './documentComments/documentCommentsConstants.js';
import { useDocumentCommentsData } from './documentComments/useDocumentCommentsData.js';
import './DocumentCommentsSection.css';

export type { DocumentCommentItem } from './documentComments/documentCommentTypes.js';

type DocumentCommentsSectionProps = {
  documentId: string;
  currentUserId: string | undefined;
  headings: { id: string; text: string }[];
  layout?: 'rail' | 'stack';
};

export function DocumentCommentsSection({
  documentId,
  currentUserId,
  headings,
  layout = 'rail',
}: DocumentCommentsSectionProps) {
  const { primaryColor } = useMantineTheme();
  const [newText, setNewText] = useState('');
  const [anchorSlug, setAnchorSlug] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editAnchorSlug, setEditAnchorSlug] = useState<string | null>(null);
  const [replyToRootId, setReplyToRootId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(`${LS_KEY_PREFIX}${documentId}`);
      if (v === '1') setPanelOpen(true);
    } catch {
      /* ignore */
    }
  }, [documentId]);

  const togglePanel = () => {
    setPanelOpen((o) => {
      const n = !o;
      try {
        localStorage.setItem(`${LS_KEY_PREFIX}${documentId}`, n ? '1' : '0');
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  const onCreateSuccess = useCallback(() => {
    setNewText('');
    setAnchorSlug(null);
    setReplyToRootId(null);
    setReplyDraft('');
  }, []);

  const onPatchSuccess = useCallback(() => {
    setEditingId(null);
    setEditAnchorSlug(null);
  }, []);

  const {
    listQuery,
    items,
    total,
    hasNextPage,
    isFetchingNextPage,
    createMutation,
    patchMutation,
    deleteMutation,
  } = useDocumentCommentsData({
    documentId,
    panelOpen,
    onCreateSuccess,
    onPatchSuccess,
  });

  const isRail = layout === 'rail';
  const contentWidth = panelOpen ? WIDTH_OPEN : WIDTH_CLOSED;
  const outerWidth = isRail ? TOGGLE_STRIP_WIDTH + contentWidth : undefined;
  const outerMinWidth = isRail ? TOGGLE_STRIP_WIDTH + contentWidth : undefined;
  const outerStyle: CSSProperties = isRail
    ? {
        width: outerWidth,
        minWidth: outerMinWidth,
        maxWidth: TOGGLE_STRIP_WIDTH + WIDTH_OPEN,
        transition: 'width 0.2s ease, min-width 0.2s ease, max-width 0.2s ease',
      }
    : {
        width: '100%',
        transition: 'min-height 0.2s ease',
      };

  return (
    <Box
      className={isRail ? 'document-comments-rail-host' : undefined}
      mt={isRail ? { base: 'xl', lg: 0 } : 'xl'}
      style={{
        ...outerStyle,
        display: 'flex',
        flexDirection: 'row',
        flexShrink: 0,
        alignSelf: 'stretch',
        ...(isRail
          ? {}
          : {
              borderTop: '1px solid var(--mantine-color-default-border)',
              borderLeft: '1px solid var(--mantine-color-default-border)',
            }),
        background: 'var(--mantine-color-body)',
        ...(isRail
          ? { maxHeight: 'min(calc(100vh - 5.5rem), 900px)' }
          : { maxHeight: 'min(75vh, 640px)' }),
      }}
    >
      <Box
        style={{
          width: TOGGLE_STRIP_WIDTH,
          minWidth: TOGGLE_STRIP_WIDTH,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 'var(--mantine-spacing-sm)',
        }}
        bg="body"
      >
        <ActionIcon
          variant="subtle"
          size="md"
          onClick={togglePanel}
          aria-expanded={panelOpen}
          aria-label={panelOpen ? 'Collapse comments' : 'Expand comments'}
        >
          {panelOpen ? (
            <IconLayoutSidebarRightCollapse
              size={16}
              color={`var(--mantine-color-${primaryColor}-filled)`}
            />
          ) : (
            <IconLayoutSidebarRightExpand
              size={16}
              color={`var(--mantine-color-${primaryColor}-filled)`}
            />
          )}
        </ActionIcon>
      </Box>

      <Box
        style={{
          width: isRail ? contentWidth : panelOpen ? undefined : WIDTH_CLOSED,
          minWidth: isRail ? contentWidth : panelOpen ? 0 : WIDTH_CLOSED,
          flex: isRail ? undefined : panelOpen ? 1 : undefined,
          flexShrink: 0,
          alignSelf: 'stretch',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--mantine-color-default-border)',
          transition: 'width 0.2s ease, min-width 0.2s ease',
          overflow: 'hidden',
        }}
        bg="body"
      >
        {panelOpen ? (
          <Box
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              ...(isRail ? { width: WIDTH_OPEN, minWidth: WIDTH_OPEN } : {}),
            }}
          >
            <ScrollArea
              className="document-comments-inner-scroll"
              style={{ flex: 1 }}
              type="auto"
              scrollbarSize="xs"
            >
              <Box
                p="md"
                role="region"
                aria-labelledby="document-comments-heading"
                data-document-comments-panel
              >
                <Group gap="xs" mb="xs" wrap="nowrap" align="center">
                  <Group gap={4} wrap="nowrap" align="center">
                    <IconMessage
                      size={COMMENT_META_ICON_SIZE}
                      color="var(--mantine-color-dimmed)"
                      aria-hidden
                    />
                    {listQuery.data != null && !listQuery.isError && (
                      <Text
                        component="span"
                        c="dimmed"
                        aria-hidden
                        style={COMMENT_META_COUNT_TEXT_STYLE}
                      >
                        ({total})
                      </Text>
                    )}
                  </Group>
                  <Text id="document-comments-heading" size="sm" fw={500}>
                    Comments
                  </Text>
                </Group>
                <Box style={{ paddingLeft: 28 }}>
                  <DocumentCommentsListBody
                    listQuery={listQuery}
                    items={items}
                    hasNextPage={hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                    headings={headings}
                    currentUserId={currentUserId}
                    newText={newText}
                    setNewText={setNewText}
                    anchorSlug={anchorSlug}
                    setAnchorSlug={setAnchorSlug}
                    editingId={editingId}
                    setEditingId={setEditingId}
                    editDraft={editDraft}
                    setEditDraft={setEditDraft}
                    editAnchorSlug={editAnchorSlug}
                    setEditAnchorSlug={setEditAnchorSlug}
                    replyToRootId={replyToRootId}
                    setReplyToRootId={setReplyToRootId}
                    replyDraft={replyDraft}
                    setReplyDraft={setReplyDraft}
                    createMutation={createMutation}
                    patchMutation={patchMutation}
                    deleteMutation={deleteMutation}
                  />
                </Box>
              </Box>
            </ScrollArea>
          </Box>
        ) : (
          <Box
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'nowrap',
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 'var(--mantine-spacing-md)',
              paddingLeft: 2,
              paddingRight: 2,
              gap: 2,
              minWidth: 0,
            }}
          >
            <IconMessage
              size={COMMENT_META_ICON_SIZE}
              color="var(--mantine-color-dimmed)"
              aria-hidden
            />
            {listQuery.data != null && !listQuery.isError && (
              <Text component="span" c="dimmed" style={COMMENT_META_COUNT_TEXT_STYLE}>
                ({total})
              </Text>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
