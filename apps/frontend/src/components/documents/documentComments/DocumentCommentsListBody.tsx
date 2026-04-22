import { Box, Button, Group, Loader, Select, Stack, Text, Textarea } from '@mantine/core';
import type {
  InfiniteData,
  UseInfiniteQueryResult,
  UseMutationResult,
} from '@tanstack/react-query';
import type { DocumentCommentItem, CommentsListResponse } from './documentCommentTypes.js';
import { DocumentCommentItemView } from './DocumentCommentItemView.js';

type CreatePayload = { text: string; parentId?: string; anchorHeadingId?: string };
type PatchArgs = {
  commentId: string;
  text: string;
  anchorHeadingId?: string | null;
};

type Props = {
  listQuery: UseInfiniteQueryResult<InfiniteData<CommentsListResponse>, Error>;
  items: DocumentCommentItem[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  headings: { id: string; text: string }[];
  currentUserId: string | undefined;
  newText: string;
  setNewText: (s: string) => void;
  anchorSlug: string | null;
  setAnchorSlug: (s: string | null) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  editDraft: string;
  setEditDraft: (s: string) => void;
  editAnchorSlug: string | null;
  setEditAnchorSlug: (s: string | null) => void;
  replyToRootId: string | null;
  setReplyToRootId: (id: string | null) => void;
  replyDraft: string;
  setReplyDraft: (s: string) => void;
  createMutation: UseMutationResult<void, Error, CreatePayload, unknown>;
  patchMutation: UseMutationResult<void, Error, PatchArgs, unknown>;
  deleteMutation: UseMutationResult<void, Error, string, unknown>;
};

export function DocumentCommentsListBody({
  listQuery,
  items,
  hasNextPage,
  isFetchingNextPage,
  headings,
  currentUserId,
  newText,
  setNewText,
  anchorSlug,
  setAnchorSlug,
  editingId,
  setEditingId,
  editDraft,
  setEditDraft,
  editAnchorSlug,
  setEditAnchorSlug,
  replyToRootId,
  setReplyToRootId,
  replyDraft,
  setReplyDraft,
  createMutation,
  patchMutation,
  deleteMutation,
}: Props) {
  return (
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
              <DocumentCommentItemView
                c={root}
                indent={false}
                headings={headings}
                currentUserId={currentUserId}
                editingId={editingId}
                setEditingId={setEditingId}
                editDraft={editDraft}
                setEditDraft={setEditDraft}
                editAnchorSlug={editAnchorSlug}
                setEditAnchorSlug={setEditAnchorSlug}
                patchMutation={patchMutation}
                deleteMutation={deleteMutation}
              />
              {(root.replies ?? []).map((r) => (
                <DocumentCommentItemView
                  key={r.id}
                  c={r}
                  indent
                  headings={headings}
                  currentUserId={currentUserId}
                  editingId={editingId}
                  setEditingId={setEditingId}
                  editDraft={editDraft}
                  setEditDraft={setEditDraft}
                  editAnchorSlug={editAnchorSlug}
                  setEditAnchorSlug={setEditAnchorSlug}
                  patchMutation={patchMutation}
                  deleteMutation={deleteMutation}
                />
              ))}
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
}
