import type { PrismaClient } from '../../generated/prisma/client.js';
import { isHeadingSlugInMarkdown } from '../lib/markdownHeadingSlugs.js';

export const DOCUMENT_COMMENT_TEXT_MAX = 16_000;

export type DocumentCommentRow = {
  id: string;
  documentId: string;
  authorId: string;
  authorName: string;
  text: string;
  parentId: string | null;
  anchorHeadingId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentCommentRowWithReplies = DocumentCommentRow & {
  replies: DocumentCommentRow[];
};

function toRow(c: {
  id: string;
  documentId: string;
  authorId: string;
  text: string;
  parentId: string | null;
  anchorHeadingId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: { name: string };
}): DocumentCommentRow {
  return {
    id: c.id,
    documentId: c.documentId,
    authorId: c.authorId,
    authorName: c.author.name,
    text: c.text,
    parentId: c.parentId,
    anchorHeadingId: c.anchorHeadingId,
    deletedAt: c.deletedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function listDocumentComments(
  prisma: PrismaClient,
  documentId: string,
  opts: { limit: number; offset: number }
): Promise<{ items: DocumentCommentRowWithReplies[]; total: number }> {
  const whereRoot = { documentId, parentId: null as string | null };
  const [roots, total] = await Promise.all([
    prisma.documentComment.findMany({
      where: whereRoot,
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: opts.limit,
      skip: opts.offset,
    }),
    prisma.documentComment.count({ where: whereRoot }),
  ]);
  const rootIds = roots.map((r) => r.id);
  const replyRows =
    rootIds.length === 0
      ? []
      : await prisma.documentComment.findMany({
          where: { documentId, parentId: { in: rootIds } },
          include: { author: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        });
  const byParent = new Map<string, typeof replyRows>();
  for (const row of replyRows) {
    const pid = row.parentId!;
    const list = byParent.get(pid);
    if (list) list.push(row);
    else byParent.set(pid, [row]);
  }
  const items: DocumentCommentRowWithReplies[] = roots.map((r) => ({
    ...toRow(r),
    replies: (byParent.get(r.id) ?? []).map(toRow),
  }));
  return { items, total };
}

export type CreateDocumentCommentResult =
  | { ok: true; comment: DocumentCommentRow }
  | {
      ok: false;
      error: 'parent_not_found' | 'invalid_parent' | 'invalid_anchor' | 'parent_deleted';
    };

export async function createDocumentComment(
  prisma: PrismaClient,
  args: {
    documentId: string;
    authorId: string;
    text: string;
    parentId?: string;
    anchorHeadingId?: string;
    documentContent: string;
  }
): Promise<CreateDocumentCommentResult> {
  let parentId: string | null = null;
  let anchorHeadingId: string | null = null;

  if (args.parentId != null && args.parentId !== '') {
    if (args.anchorHeadingId != null && args.anchorHeadingId !== '') {
      return { ok: false, error: 'invalid_anchor' };
    }
    const parent = await prisma.documentComment.findFirst({
      where: { id: args.parentId, documentId: args.documentId },
    });
    if (!parent) return { ok: false, error: 'parent_not_found' };
    if (parent.parentId != null) return { ok: false, error: 'invalid_parent' };
    if (parent.deletedAt != null) return { ok: false, error: 'parent_deleted' };
    parentId = parent.id;
  } else if (args.anchorHeadingId != null && args.anchorHeadingId !== '') {
    if (!isHeadingSlugInMarkdown(args.documentContent, args.anchorHeadingId)) {
      return { ok: false, error: 'invalid_anchor' };
    }
    anchorHeadingId = args.anchorHeadingId;
  }

  const c = await prisma.documentComment.create({
    data: {
      documentId: args.documentId,
      authorId: args.authorId,
      text: args.text,
      parentId,
      anchorHeadingId,
    },
    include: { author: { select: { name: true } } },
  });
  return { ok: true, comment: toRow(c) };
}

export type UpdateCommentResult =
  | { ok: true; comment: DocumentCommentRow }
  | {
      ok: false;
      error: 'not_found' | 'forbidden' | 'invalid_anchor' | 'anchor_only_on_root' | 'deleted';
    };

export async function updateDocumentComment(
  prisma: PrismaClient,
  args: {
    documentId: string;
    commentId: string;
    userId: string;
    text?: string;
    anchorHeadingId?: string | null;
    documentContent: string;
  }
): Promise<UpdateCommentResult> {
  const existing = await prisma.documentComment.findFirst({
    where: { id: args.commentId, documentId: args.documentId },
  });
  if (!existing) return { ok: false, error: 'not_found' };
  if (existing.deletedAt != null) return { ok: false, error: 'deleted' };
  if (existing.authorId !== args.userId) return { ok: false, error: 'forbidden' };

  if (args.anchorHeadingId !== undefined) {
    if (existing.parentId != null) return { ok: false, error: 'anchor_only_on_root' };
    if (args.anchorHeadingId != null && args.anchorHeadingId !== '') {
      if (!isHeadingSlugInMarkdown(args.documentContent, args.anchorHeadingId)) {
        return { ok: false, error: 'invalid_anchor' };
      }
    }
  }

  const data: { text?: string; anchorHeadingId?: string | null } = {};
  if (args.text !== undefined) data.text = args.text;
  if (args.anchorHeadingId !== undefined) {
    data.anchorHeadingId =
      args.anchorHeadingId === null || args.anchorHeadingId === '' ? null : args.anchorHeadingId;
  }

  const c = await prisma.documentComment.update({
    where: { id: args.commentId },
    data,
    include: { author: { select: { name: true } } },
  });
  return { ok: true, comment: toRow(c) };
}

export type DeleteCommentResult =
  | { ok: true }
  | { ok: false; error: 'not_found' | 'forbidden' | 'already_deleted' };

export async function deleteDocumentComment(
  prisma: PrismaClient,
  args: {
    documentId: string;
    commentId: string;
    userId: string;
    canModerate: boolean;
  }
): Promise<DeleteCommentResult> {
  const existing = await prisma.documentComment.findFirst({
    where: { id: args.commentId, documentId: args.documentId },
  });
  if (!existing) return { ok: false, error: 'not_found' };
  const isAuthor = existing.authorId === args.userId;
  if (!isAuthor && !args.canModerate) return { ok: false, error: 'forbidden' };

  if (existing.parentId != null) {
    await prisma.documentComment.delete({ where: { id: args.commentId } });
    return { ok: true };
  }

  if (existing.deletedAt != null) {
    return { ok: false, error: 'already_deleted' };
  }

  await prisma.documentComment.update({
    where: { id: args.commentId },
    data: { deletedAt: new Date() },
  });
  return { ok: true };
}
