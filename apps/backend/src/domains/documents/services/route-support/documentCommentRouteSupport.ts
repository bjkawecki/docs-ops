import type { PrismaClient } from '../../../../../generated/prisma/client.js';
import type {
  CreateDocumentCommentResult,
  DeleteCommentResult,
  DocumentCommentRow,
  DocumentCommentRowWithReplies,
  UpdateCommentResult,
} from '../collaboration/documentCommentService.js';

type SerializedComment = {
  id: string;
  documentId: string;
  authorId: string;
  authorName: string;
  text: string;
  parentId: string | null;
  anchorHeadingId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canDelete: boolean;
};

export async function loadDocumentCommentAnchorSnapshot(
  prisma: PrismaClient,
  documentId: string
): Promise<{ title: string | null; activeBlocks: unknown } | null> {
  const row = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      title: true,
      publishedAt: true,
      draftBlocks: true,
      currentPublishedVersion: { select: { blocks: true } },
    },
  });
  if (!row) return null;
  const activeBlocks =
    row.publishedAt != null ? (row.currentPublishedVersion?.blocks ?? null) : row.draftBlocks;
  return { title: row.title, activeBlocks };
}

export function serializeCommentRow(
  row: DocumentCommentRow,
  args: { userId: string; canModerate: boolean; hideDeletedText?: boolean }
): SerializedComment {
  const removed = row.deletedAt != null;
  return {
    id: row.id,
    documentId: row.documentId,
    authorId: row.authorId,
    authorName: row.authorName,
    text: removed && args.hideDeletedText ? '' : row.text,
    parentId: row.parentId,
    anchorHeadingId: row.anchorHeadingId,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canDelete: removed ? false : row.authorId === args.userId || args.canModerate,
  };
}

export function serializeCommentTree(
  rows: DocumentCommentRowWithReplies[],
  args: { userId: string; canModerate: boolean }
) {
  return rows.map((root) => ({
    ...serializeCommentRow(root, { ...args, hideDeletedText: true }),
    replies: root.replies.map((reply) =>
      serializeCommentRow(reply, { ...args, hideDeletedText: true })
    ),
  }));
}

export function mapCreateCommentError(
  result: Extract<CreateDocumentCommentResult, { ok: false }>
): {
  status: number;
  error: string;
} {
  if (result.error === 'parent_not_found')
    return { status: 404, error: 'Comment thread not found' };
  if (result.error === 'invalid_parent') {
    return { status: 400, error: 'You can only reply to a top-level comment' };
  }
  if (result.error === 'parent_deleted')
    return { status: 400, error: 'Cannot reply to a removed comment' };
  return { status: 400, error: 'Invalid section anchor' };
}

export function mapUpdateCommentError(result: Extract<UpdateCommentResult, { ok: false }>): {
  status: number;
  error: string;
} {
  if (result.error === 'not_found') return { status: 404, error: 'Comment not found' };
  if (result.error === 'forbidden')
    return { status: 403, error: 'You can only edit your own comments' };
  if (result.error === 'deleted') return { status: 400, error: 'This comment was removed' };
  if (result.error === 'anchor_only_on_root') {
    return { status: 400, error: 'Section anchor can only be set on top-level comments' };
  }
  return { status: 400, error: 'Invalid section anchor' };
}

export function mapDeleteCommentError(result: Extract<DeleteCommentResult, { ok: false }>): {
  status: number;
  error: string;
} {
  if (result.error === 'not_found') return { status: 404, error: 'Comment not found' };
  if (result.error === 'already_deleted') return { status: 409, error: 'Comment already removed' };
  return { status: 403, error: 'You cannot delete this comment' };
}
