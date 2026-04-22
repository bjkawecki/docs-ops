import { Badge, Box, Button, Group, Select, Stack, Text, Textarea } from '@mantine/core';
import type { UseMutationResult } from '@tanstack/react-query';
import type { DocumentCommentItem } from './documentCommentTypes.js';
import { headingLabel } from './documentCommentsConstants.js';

type PatchArgs = {
  commentId: string;
  text: string;
  anchorHeadingId?: string | null;
};

type Props = {
  c: DocumentCommentItem;
  indent: boolean;
  headings: { id: string; text: string }[];
  currentUserId: string | undefined;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  editDraft: string;
  setEditDraft: (s: string) => void;
  editAnchorSlug: string | null;
  setEditAnchorSlug: (s: string | null) => void;
  patchMutation: UseMutationResult<void, Error, PatchArgs, unknown>;
  deleteMutation: UseMutationResult<void, Error, string, unknown>;
};

export function DocumentCommentItemView({
  c,
  indent,
  headings,
  currentUserId,
  editingId,
  setEditingId,
  editDraft,
  setEditDraft,
  editAnchorSlug,
  setEditAnchorSlug,
  patchMutation,
  deleteMutation,
}: Props) {
  const isAuthor = currentUserId != null && c.authorId === currentUserId;
  const canEdit = isAuthor;
  const showDelete = c.canDelete;
  const isEditing = editingId === c.id;
  const isRoot = c.parentId == null;
  const rootRemoved = isRoot && c.deletedAt != null && c.deletedAt !== '';

  return (
    <Box
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
}
