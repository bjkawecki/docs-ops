import type { PrismaClient } from '../../../generated/prisma/client.js';

/** Metadata-only update payload. No lifecycle fields (publishedAt, archivedAt, deletedAt). */
export type UpdateDocumentMetadataData = {
  title?: string;
  content?: string;
  contextId?: string | null;
  description?: string | null;
  tagIds?: string[];
};

const DOCUMENT_PATCH_SELECT = {
  id: true,
  title: true,
  content: true,
  pdfUrl: true,
  contextId: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  description: true,
  createdById: true,
  createdBy: { select: { name: true } },
  documentTags: { include: { tag: { select: { id: true, name: true } } } },
} as const;

/** Result of updateDocumentMetadata (PATCH response shape). */
export interface DocumentMetadataUpdateResult {
  id: string;
  title: string;
  content: string;
  pdfUrl: string | null;
  contextId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  description: string | null;
  createdById: string | null;
  createdBy: { name: string } | null;
  documentTags: { tag: { id: string; name: string } }[];
}

/**
 * Publishes a draft document: creates version 1 and sets publishedAt.
 * Caller must enforce canPublishDocument. Document must have contextId and publishedAt null.
 */
export async function publishDocument(
  prisma: PrismaClient,
  documentId: string,
  userId: string
): Promise<{ id: string; publishedAt: Date; currentPublishedVersionId: string }> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId, deletedAt: null },
    select: { id: true, contextId: true, publishedAt: true, content: true },
  });
  if (!doc) throw new DocumentNotFoundError(documentId);
  if (doc.contextId == null)
    throw new DocumentNotPublishableError(
      'Document must be assigned to a context before publishing'
    );
  if (doc.publishedAt != null) throw new DocumentAlreadyPublishedError(documentId);

  await prisma.$transaction(async (tx) => {
    const v = await tx.documentVersion.create({
      data: {
        documentId,
        content: doc.content,
        versionNumber: 1,
        createdById: userId,
      },
      select: { id: true },
    });
    await tx.document.update({
      where: { id: documentId },
      data: { publishedAt: new Date(), currentPublishedVersionId: v.id },
    });
  });

  const updated = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, publishedAt: true, currentPublishedVersionId: true },
  });
  if (!updated || !updated.publishedAt || !updated.currentPublishedVersionId) {
    throw new Error('Publish succeeded but document state inconsistent');
  }
  return {
    id: updated.id,
    publishedAt: updated.publishedAt,
    currentPublishedVersionId: updated.currentPublishedVersionId,
  };
}

/**
 * Archives a document (sets archivedAt). Caller must enforce write permission.
 */
export async function archiveDocument(prisma: PrismaClient, documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, deletedAt: true },
  });
  if (!doc) throw new DocumentNotFoundError(documentId);
  if (doc.deletedAt != null) throw new DocumentDeletedError(documentId);

  await prisma.document.update({
    where: { id: documentId },
    data: { archivedAt: new Date() },
  });
}

/**
 * Restores a document from trash. If context is trashed, unlinks document (contextId = null).
 * Caller must enforce canDeleteDocument or canSeeDocumentInTrash.
 */
export async function restoreDocument(prisma: PrismaClient, documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, contextId: true, deletedAt: true },
  });
  if (!doc) throw new DocumentNotFoundError(documentId);
  if (doc.deletedAt == null) throw new DocumentNotInTrashError(documentId);

  let contextTrashed = false;
  if (doc.contextId) {
    const [process, project] = await Promise.all([
      prisma.process.findFirst({
        where: { contextId: doc.contextId },
        select: { deletedAt: true },
      }),
      prisma.project.findFirst({
        where: { contextId: doc.contextId },
        select: { deletedAt: true },
      }),
    ]);
    contextTrashed = process?.deletedAt != null || project?.deletedAt != null;
  }

  await prisma.document.update({
    where: { id: documentId },
    data: contextTrashed ? { deletedAt: null, contextId: null } : { deletedAt: null },
  });
}

/**
 * Soft-deletes a document (sets deletedAt) and removes pins. Caller must enforce canDeleteDocument.
 */
export async function deleteDocument(prisma: PrismaClient, documentId: string): Promise<void> {
  await prisma.documentPinnedInScope.deleteMany({ where: { documentId } });
  await prisma.document.update({
    where: { id: documentId },
    data: { deletedAt: new Date() },
  });
}

/**
 * Updates document metadata only (title, content, contextId, description, tagIds).
 * No lifecycle fields. Caller must enforce canWrite and validate contextId/tagIds.
 * Enforces: published document cannot have contextId set to null.
 */
export async function updateDocumentMetadata(
  prisma: PrismaClient,
  documentId: string,
  data: UpdateDocumentMetadataData
): Promise<DocumentMetadataUpdateResult> {
  const updatePayload: {
    title?: string;
    content?: string;
    contextId?: string | null;
    description?: string | null;
  } = {};
  if (data.title != null) updatePayload.title = data.title;
  if (data.content != null) updatePayload.content = data.content;
  if (data.description !== undefined) updatePayload.description = data.description;
  if (data.contextId !== undefined) {
    const current = await prisma.document.findUnique({
      where: { id: documentId },
      select: { publishedAt: true },
    });
    if (!current) throw new DocumentNotFoundError(documentId);
    if (data.contextId === null && current.publishedAt != null) {
      throw new DocumentBusinessError('Published document cannot be set to no context');
    }
    updatePayload.contextId = data.contextId;
  }

  if (data.tagIds !== undefined) {
    await prisma.documentTag.deleteMany({ where: { documentId } });
    if (data.tagIds.length > 0) {
      await prisma.documentTag.createMany({
        data: data.tagIds.map((tagId) => ({ documentId, tagId })),
        skipDuplicates: true,
      });
    }
  }

  const updated = await prisma.document.update({
    where: { id: documentId },
    data: updatePayload,
    select: DOCUMENT_PATCH_SELECT,
  });
  return updated as DocumentMetadataUpdateResult;
}

export class DocumentNotFoundError extends Error {
  constructor(public readonly documentId: string) {
    super(`Document not found: ${documentId}`);
    this.name = 'DocumentNotFoundError';
  }
}

export class DocumentNotPublishableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentNotPublishableError';
  }
}

export class DocumentAlreadyPublishedError extends Error {
  constructor(public readonly documentId: string) {
    super(`Document is already published: ${documentId}`);
    this.name = 'DocumentAlreadyPublishedError';
  }
}

export class DocumentDeletedError extends Error {
  constructor(public readonly documentId: string) {
    super(`Document is deleted: ${documentId}`);
    this.name = 'DocumentDeletedError';
  }
}

export class DocumentNotInTrashError extends Error {
  constructor(public readonly documentId: string) {
    super(`Document is not in trash: ${documentId}`);
    this.name = 'DocumentNotInTrashError';
  }
}

export class DocumentBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentBusinessError';
  }
}
