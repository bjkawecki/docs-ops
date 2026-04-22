import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
  useMantineTheme,
} from '@mantine/core';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconMessage,
} from '@tabler/icons-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { apiFetch } from '../../api/client';
import './DocumentCommentsSection.css';

const PAGE_SIZE = 10;
const LS_KEY_PREFIX = 'docsops.documentComments.open.';
const TOGGLE_STRIP_WIDTH = 32;
const WIDTH_OPEN = 300;
const WIDTH_CLOSED = 48;
const COMMENT_META_ICON_SIZE = 16;
const COMMENT_META_COUNT_TEXT_STYLE: CSSProperties = {
  lineHeight: 1,
  whiteSpace: 'nowrap',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums',
};

export type DocumentCommentItem = {
  id: string;
  documentId: string;
  authorId: string;
  authorName: string;
  text: string;
  parentId: string | null;
  anchorHeadingId?: string | null;
  /** Nur Root: gesetzt = weicher Löschvorgang, Antworten bleiben sichtbar. */
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  canDelete: boolean;
  replies?: DocumentCommentItem[];
};

type CommentsListResponse = {
  items: DocumentCommentItem[];
  total: number;
  limit: number;
  offset: number;
};

function commentsInfiniteQueryKey(documentId: string) {
  return ['documents', documentId, 'comments', 'infinite', PAGE_SIZE] as const;
}

type DocumentCommentsSectionProps = {
  documentId: string;
  currentUserId: string | undefined;
  headings: { id: string; text: string }[];
  layout?: 'rail' | 'stack';
};

function headingLabel(headings: { id: string; text: string }[], slug: string | null | undefined) {
  if (slug == null || slug === '') return null;
  const h = headings.find((x) => x.id === slug);
  return h?.text ?? slug;
}

export function DocumentCommentsSection({
  documentId,
  currentUserId,
  headings,
  layout = 'rail',
}: DocumentCommentsSectionProps) {
  const { primaryColor } = useMantineTheme();
  const queryClient = useQueryClient();
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

  const listQuery = useInfiniteQuery({
    queryKey: commentsInfiniteQueryKey(documentId),
    initialPageParam: 0,
    enabled: panelOpen,
    queryFn: async ({ pageParam }): Promise<CommentsListResponse> => {
      const res = await apiFetch(
        `/api/v1/documents/${documentId}/comments?limit=${PAGE_SIZE}&offset=${pageParam}`
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to load comments');
      }
      return res.json() as Promise<CommentsListResponse>;
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0);
      if (loaded >= lastPage.total) return undefined;
      return loaded;
    },
  });

  const items = listQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const total = listQuery.data?.pages[0]?.total ?? 0;
  const hasNextPage = listQuery.hasNextPage;
  const isFetchingNextPage = listQuery.isFetchingNextPage;

  const createMutation = useMutation({
    mutationFn: async (payload: { text: string; parentId?: string; anchorHeadingId?: string }) => {
      const res = await apiFetch(`/api/v1/documents/${documentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to post comment');
      }
    },
    onSuccess: () => {
      setNewText('');
      setAnchorSlug(null);
      setReplyToRootId(null);
      setReplyDraft('');
      void queryClient.invalidateQueries({ queryKey: ['documents', documentId, 'comments'] });
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Comment', message: e.message, color: 'red' });
    },
  });

  const patchMutation = useMutation({
    mutationFn: async (args: {
      commentId: string;
      text: string;
      anchorHeadingId?: string | null;
    }) => {
      const body: { text: string; anchorHeadingId?: string | null } = { text: args.text };
      if (args.anchorHeadingId !== undefined) body.anchorHeadingId = args.anchorHeadingId;
      const res = await apiFetch(`/api/v1/documents/${documentId}/comments/${args.commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update comment');
      }
    },
    onSuccess: () => {
      setEditingId(null);
      setEditAnchorSlug(null);
      void queryClient.invalidateQueries({ queryKey: ['documents', documentId, 'comments'] });
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Comment', message: e.message, color: 'red' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await apiFetch(`/api/v1/documents/${documentId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete comment');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents', documentId, 'comments'] });
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Comment', message: e.message, color: 'red' });
    },
  });

  const renderComment = (c: DocumentCommentItem, opts: { indent?: boolean }) => {
    const isAuthor = currentUserId != null && c.authorId === currentUserId;
    const canEdit = isAuthor;
    const showDelete = c.canDelete;
    const isEditing = editingId === c.id;
    const indent = opts.indent ?? false;
    const isRoot = c.parentId == null;
    const rootRemoved = isRoot && c.deletedAt != null && c.deletedAt !== '';

    return (
      <Box
        key={c.id}
        py="xs"
        pl={indent ? 'md' : 0}
        style={
          indent
            ? { borderLeft: '2px solid var(--mantine-color-default-border)' }
            : { borderTop: '1px solid var(--mantine-color-default-border)' }
        }
      >
        {rootRemoved ? (
          <Text size="sm" c="dimmed" fs="italic">
            Dieser Kommentar wurde entfernt.
          </Text>
        ) : (
          <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
            <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
              <Group gap={6} wrap="wrap">
                <Text size="sm" fw={600}>
                  {c.authorName}
                </Text>
                <Text span size="xs" c="dimmed" fw={400}>
                  {new Date(c.createdAt).toLocaleString()}
                  {c.updatedAt !== c.createdAt ? ' · edited' : ''}
                </Text>
                {c.parentId == null &&
                  c.anchorHeadingId != null &&
                  c.anchorHeadingId !== '' &&
                  headingLabel(headings, c.anchorHeadingId) != null && (
                    <Badge size="xs" variant="light" color="gray">
                      Section: {headingLabel(headings, c.anchorHeadingId)}
                    </Badge>
                  )}
              </Group>
              {isEditing ? (
                <Stack gap="xs">
                  <Textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.currentTarget.value)}
                    minRows={2}
                    maxLength={16_000}
                  />
                  {isRoot && headings.length > 0 && (
                    <Select
                      size="sm"
                      label="Section (optional)"
                      placeholder="No section"
                      clearable
                      data={headings.map((h) => ({ value: h.id, label: h.text }))}
                      value={editAnchorSlug}
                      onChange={setEditAnchorSlug}
                    />
                  )}
                  <Group gap="xs">
                    <Button
                      size="xs"
                      onClick={() => {
                        const t = editDraft.trim();
                        if (!t) return;
                        if (isRoot && headings.length > 0) {
                          patchMutation.mutate({
                            commentId: c.id,
                            text: t,
                            anchorHeadingId:
                              editAnchorSlug === null || editAnchorSlug === ''
                                ? null
                                : editAnchorSlug,
                          });
                        } else {
                          patchMutation.mutate({ commentId: c.id, text: t });
                        }
                      }}
                      loading={patchMutation.isPending}
                    >
                      Save
                    </Button>
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => {
                        setEditingId(null);
                        setEditAnchorSlug(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </Group>
                </Stack>
              ) : (
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {c.text}
                </Text>
              )}
            </Stack>
            {!isEditing && (canEdit || showDelete) && (
              <Group gap={4} wrap="nowrap">
                {canEdit && (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => {
                      setEditingId(c.id);
                      setEditDraft(c.text);
                      setEditAnchorSlug(
                        isRoot && c.anchorHeadingId != null && c.anchorHeadingId !== ''
                          ? c.anchorHeadingId
                          : null
                      );
                    }}
                  >
                    Edit
                  </Button>
                )}
                {showDelete && (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    loading={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm('Delete this comment?')) {
                        deleteMutation.mutate(c.id);
                      }
                    }}
                  >
                    Delete
                  </Button>
                )}
              </Group>
            )}
          </Group>
        )}
      </Box>
    );
  };

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

  const listBody = (
    <>
      {!listQuery.isPending && !listQuery.isError && items.length === 0 && (
        <Text size="sm" c="dimmed" mb="sm">
          No comments yet.
        </Text>
      )}

      {replyToRootId != null && (
        <Box mb="sm" p="xs" style={{ background: 'var(--mantine-color-default-hover)' }}>
          <Text size="xs" c="dimmed" mb={4}>
            Reply to thread
          </Text>
          <Textarea
            placeholder="Write a reply…"
            value={replyDraft}
            onChange={(e) => setReplyDraft(e.currentTarget.value)}
            minRows={2}
            maxLength={16_000}
          />
          <Group justify="flex-end" gap="xs" mt="xs">
            <Button size="xs" variant="default" onClick={() => setReplyToRootId(null)}>
              Cancel
            </Button>
            <Button
              size="xs"
              loading={createMutation.isPending}
              disabled={!replyDraft.trim()}
              onClick={() => {
                const t = replyDraft.trim();
                if (!t || replyToRootId == null) return;
                createMutation.mutate({ text: t, parentId: replyToRootId });
              }}
            >
              Post reply
            </Button>
          </Group>
        </Box>
      )}

      {replyToRootId == null && (
        <Stack gap="xs" mb="md">
          {headings.length > 0 && (
            <Select
              size="sm"
              label="Attach to section (optional)"
              placeholder="No section"
              clearable
              data={headings.map((h) => ({ value: h.id, label: h.text }))}
              value={anchorSlug}
              onChange={setAnchorSlug}
            />
          )}
          <Textarea
            label="Add a comment"
            placeholder="Write a comment…"
            value={newText}
            onChange={(e) => setNewText(e.currentTarget.value)}
            minRows={2}
            maxLength={16_000}
          />
          <Group justify="flex-end">
            <Button
              size="sm"
              onClick={() => {
                const t = newText.trim();
                if (!t) return;
                const payload: { text: string; anchorHeadingId?: string } = { text: t };
                if (anchorSlug != null && anchorSlug !== '') payload.anchorHeadingId = anchorSlug;
                createMutation.mutate(payload);
              }}
              loading={createMutation.isPending}
              disabled={!newText.trim()}
            >
              Post comment
            </Button>
          </Group>
        </Stack>
      )}

      {listQuery.isError && (
        <Text size="sm" c="red">
          {listQuery.error instanceof Error ? listQuery.error.message : 'Failed to load comments'}
        </Text>
      )}
      {listQuery.isPending && (
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      )}

      <Stack gap={0}>
        {items.map((root) => {
          const rootDeleted = root.deletedAt != null && root.deletedAt !== '';
          return (
            <Box key={root.id}>
              {renderComment(root, {})}
              {(root.replies ?? []).map((r) => renderComment(r, { indent: true }))}
              {!rootDeleted && (
                <Box pl="md" pb="xs">
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => {
                      setReplyToRootId(root.id);
                      setReplyDraft('');
                    }}
                  >
                    Reply
                  </Button>
                </Box>
              )}
            </Box>
          );
        })}
      </Stack>

      {hasNextPage && (
        <Group justify="center" mt="md">
          <Button
            size="xs"
            variant="light"
            loading={isFetchingNextPage}
            onClick={() => void listQuery.fetchNextPage()}
          >
            Load more comments
          </Button>
        </Group>
      )}
    </>
  );

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
                <Box style={{ paddingLeft: 28 }}>{listBody}</Box>
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
