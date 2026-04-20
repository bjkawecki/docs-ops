import {
  Badge,
  Box,
  Button,
  Collapse,
  Group,
  Loader,
  Pagination,
  Select,
  Stack,
  Text,
  Textarea,
  UnstyledButton,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconChevronDown, IconChevronRight, IconMessage } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';

const PAGE_SIZE = 20;
const LS_KEY_PREFIX = 'docsops.documentComments.open.';

export type DocumentCommentItem = {
  id: string;
  documentId: string;
  authorId: string;
  authorName: string;
  text: string;
  parentId: string | null;
  anchorHeadingId?: string | null;
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

function commentsQueryKey(documentId: string, page: number) {
  return ['documents', documentId, 'comments', page, PAGE_SIZE] as const;
}

type DocumentCommentsSectionProps = {
  documentId: string;
  currentUserId: string | undefined;
  /** Markdown heading ids (slugs) and labels for optional comment anchor. */
  headings: { id: string; text: string }[];
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
}: DocumentCommentsSectionProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
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

  const offset = (page - 1) * PAGE_SIZE;

  const listQuery = useQuery({
    queryKey: commentsQueryKey(documentId, page),
    queryFn: async (): Promise<CommentsListResponse> => {
      const res = await apiFetch(
        `/api/v1/documents/${documentId}/comments?limit=${PAGE_SIZE}&offset=${offset}`
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to load comments');
      }
      return res.json() as Promise<CommentsListResponse>;
    },
  });

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

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const renderComment = (c: DocumentCommentItem, opts: { indent?: boolean }) => {
    const isAuthor = currentUserId != null && c.authorId === currentUserId;
    const canEdit = isAuthor;
    const showDelete = c.canDelete;
    const isEditing = editingId === c.id;
    const indent = opts.indent ?? false;
    const isRoot = c.parentId == null;

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
      </Box>
    );
  };

  return (
    <Box
      mt="xl"
      style={{
        borderTop: '1px solid var(--mantine-color-default-border)',
        borderLeft: '1px solid var(--mantine-color-default-border)',
      }}
      bg="var(--mantine-color-body)"
    >
      <UnstyledButton onClick={togglePanel} w="100%" py="sm" px="md" aria-expanded={panelOpen}>
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Group gap="xs" wrap="nowrap">
            {panelOpen ? (
              <IconChevronDown size={18} color="var(--mantine-color-dimmed)" aria-hidden />
            ) : (
              <IconChevronRight size={18} color="var(--mantine-color-dimmed)" aria-hidden />
            )}
            <IconMessage size={18} color="var(--mantine-color-dimmed)" aria-hidden />
            <Text size="sm" fw={500}>
              Comments
            </Text>
            {!listQuery.isPending && !listQuery.isError && total > 0 && (
              <Text size="sm" c="dimmed">
                ({total})
              </Text>
            )}
          </Group>
          {listQuery.isPending && <Loader size="xs" />}
        </Group>
      </UnstyledButton>

      <Collapse in={panelOpen}>
        <Box px="md" pb="md" style={{ paddingLeft: 28 }}>
          <Text size="sm" c="dimmed" mb="sm">
            Plain text. Anyone who can read this document can comment; scope leads can remove any
            comment.
          </Text>

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
                    if (anchorSlug != null && anchorSlug !== '')
                      payload.anchorHeadingId = anchorSlug;
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
              {listQuery.error instanceof Error
                ? listQuery.error.message
                : 'Failed to load comments'}
            </Text>
          )}
          {!listQuery.isPending && !listQuery.isError && items.length === 0 && (
            <Text size="sm" c="dimmed">
              No comments yet.
            </Text>
          )}

          <Stack gap={0}>
            {items.map((root) => (
              <Box key={root.id}>
                {renderComment(root, {})}
                {(root.replies ?? []).map((r) => renderComment(r, { indent: true }))}
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
              </Box>
            ))}
          </Stack>

          {totalPages > 1 && (
            <Group justify="center" mt="md">
              <Pagination value={page} onChange={(p) => setPage(p)} total={totalPages} size="sm" />
            </Group>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
