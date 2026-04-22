import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  requireAuthPreHandler,
  preHandlerWrap,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../auth/middleware.js';
import {
  requireDocumentAccess,
  canDeleteDocument,
  canWrite,
  canPublishDocument,
  canModerateDocumentComments,
  DOCUMENT_FOR_PERMISSION_INCLUDE,
} from '../permissions/index.js';
import {
  canWriteContext,
  getContextOwnerId,
} from '../../organisation/permissions/contextPermissions.js';
import {
  deleteDocument,
  updateDocumentMetadata,
  type DocumentMetadataUpdateResult,
  DocumentNotFoundError,
  DocumentBusinessError,
} from '../services/lifecycle/documentService.js';
import { emptyBlockDocumentJson } from '../services/blocks/documentBlocksBackfill.js';
import { documentMarkdownFromRow } from '../services/query/documentMarkdownSnapshot.js';
import {
  documentIdParamSchema,
  createDocumentBodySchema,
  updateDocumentBodySchema,
} from '../schemas/documents.js';
import {
  excludeUserIds,
  listUserIdsWhoCanReadDocument,
  listUserIdsWhoCanReadOrWriteDocument,
} from '../../notifications/services/notificationRecipients.js';
import {
  enqueueIncrementalReindexForDocumentSafe,
  enqueueNotificationEvent,
  buildDocumentDetailResponse,
  patchTouchesReaderVisibleFields,
  readerVisibleContentChanged,
} from '../services/route-support/documentRouteSupport.js';
import { requireStorageAndDocumentAttachment } from './document-attachment-route-helpers.js';
import { routePrismaUserDocumentId } from './collaboration-route-helpers.js';

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const DOCUMENT_CREATE_SELECT = {
  id: true,
  title: true,
  draftBlocks: true,
  publishedAt: true,
  pdfUrl: true,
  contextId: true,
  createdAt: true,
  updatedAt: true,
  description: true,
  createdById: true,
  createdBy: { select: { name: true } },
  documentTags: { include: { tag: { select: { id: true, name: true } } } },
  currentPublishedVersion: { select: { blocks: true } },
} as const;

type CreatedDocumentResponseRow = {
  publishedAt: Date | null;
  draftBlocks: unknown;
  currentPublishedVersion: { blocks: unknown } | null;
  createdBy?: { name: string } | null;
};

function buildCreatedDocumentResponse<T extends CreatedDocumentResponseRow>(created: T) {
  return {
    ...created,
    content: documentMarkdownFromRow({
      publishedAt: created.publishedAt,
      draftBlocks: created.draftBlocks,
      currentPublishedVersion: created.currentPublishedVersion,
    }),
    createdByName: created.createdBy?.name ?? null,
    writers: { users: [], teams: [], departments: [] },
  };
}

async function validateContextWriteAccess(
  prisma: FastifyInstance['prisma'],
  userId: string,
  contextId: string,
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  forbiddenMessage: string
): Promise<boolean> {
  const context = await prisma.context.findUnique({
    where: { id: contextId },
    select: { id: true },
  });
  if (!context) {
    await reply.status(404).send({ error: 'Context not found' });
    return false;
  }
  const allowed = await canWriteContext(prisma, userId, contextId);
  if (!allowed) {
    await reply.status(403).send({ error: forbiddenMessage });
    return false;
  }
  return true;
}

async function validateTagsForContext(
  prisma: FastifyInstance['prisma'],
  contextId: string,
  tagIds: string[],
  reply: { status: (code: number) => { send: (body: unknown) => unknown } }
): Promise<boolean> {
  if (tagIds.length === 0) return true;
  const contextOwnerId = await getContextOwnerId(prisma, contextId);
  if (!contextOwnerId) {
    await reply
      .status(400)
      .send({ error: 'Kontext hat keinen Owner; Tags können nicht zugewiesen werden.' });
    return false;
  }
  const tags = await prisma.tag.findMany({
    where: { id: { in: tagIds } },
    select: { id: true, ownerId: true },
  });
  const invalid = tags.some((t) => t.ownerId !== contextOwnerId);
  if (invalid || tags.length !== tagIds.length) {
    await reply
      .status(400)
      .send({ error: 'Ein oder mehrere Tags gehören nicht zum Kontext-Scope.' });
    return false;
  }
  return true;
}

export const registerContentRoutes = (app: FastifyInstance): void => {
  app.post<{
    Params: { documentId: string };
    Body: Buffer;
  }>(
    '/documents/:documentId/attachments',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
      bodyLimit: MAX_ATTACHMENT_SIZE_BYTES,
    },
    async (request, reply) => {
      const storage = request.server.storage;
      if (!storage) return reply.status(503).send({ error: 'Storage not available' });
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const filename = (request.headers['x-filename'] as string)?.trim();
      if (!filename) return reply.status(400).send({ error: 'X-Filename header required' });
      const body = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply.status(400).send({ error: 'Binary body required' });
      }
      if (body.length > MAX_ATTACHMENT_SIZE_BYTES) {
        return reply.status(413).send({ error: 'File too large' });
      }
      const contentType = (request.headers['content-type'] as string) ?? undefined;
      const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'bin';
      const objectKey = `attachments/${documentId}/${randomUUID()}.${ext}`;
      await storage.uploadStream(objectKey, body, contentType);
      const attachment = await prisma.documentAttachment.create({
        data: {
          documentId,
          objectKey,
          filename,
          contentType: contentType || null,
          sizeBytes: body.length,
          uploadedById: userId,
        },
      });
      return reply.status(201).send({
        id: attachment.id,
        documentId: attachment.documentId,
        filename: attachment.filename,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
        createdAt: attachment.createdAt,
      });
    }
  );
  app.delete<{ Params: { documentId: string; attachmentId: string } }>(
    '/documents/:documentId/attachments/:attachmentId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
    },
    async (request, reply) => {
      const loaded = await requireStorageAndDocumentAttachment(request, reply);
      if (!loaded) return;
      const { storage, prisma, attachmentId, attachment } = loaded;
      await storage.deleteObject(attachment.objectKey);
      await prisma.documentAttachment.delete({ where: { id: attachmentId } });
      return reply.status(204).send();
    }
  );
  app.get<{ Params: { documentId: string } }>(
    '/documents/:documentId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const { prisma, userId, documentId } = routePrismaUserDocumentId(request);
      const doc = await prisma.document.findFirst({
        where: { id: documentId },
        include: {
          ...DOCUMENT_FOR_PERMISSION_INCLUDE,
          documentTags: { include: { tag: { select: { id: true, name: true } } } },
          createdBy: { select: { name: true } },
          currentPublishedVersion: {
            select: { versionNumber: true, blocks: true, blocksSchemaVersion: true },
          },
          grantUser: { include: { user: { select: { name: true } } } },
          grantTeam: { include: { team: { select: { name: true } } } },
          grantDepartment: { include: { department: { select: { name: true } } } },
        },
      });
      if (!doc) return reply.status(404).send({ error: 'Document not found' });
      const isTrashed = doc.deletedAt != null;
      if (!isTrashed && doc.publishedAt == null) {
        const writeAllowedForDraft = await canWrite(prisma, userId, doc);
        if (!writeAllowedForDraft) {
          return reply
            .status(403)
            .send({ error: 'Draft documents are only visible to users with write access' });
        }
      }
      const [writeAllowed, deleteAllowed, canPublish, canModerateComments] = await Promise.all([
        isTrashed ? Promise.resolve(false) : canWrite(prisma, userId, doc),
        canDeleteDocument(prisma, userId, documentId),
        isTrashed ? Promise.resolve(false) : canPublishDocument(prisma, userId, documentId),
        isTrashed ? Promise.resolve(false) : canModerateDocumentComments(prisma, userId, doc),
      ]);
      return reply.send(
        buildDocumentDetailResponse({
          doc,
          writeAllowed,
          deleteAllowed,
          canPublish,
          canModerateComments,
        })
      );
    }
  );
  app.post('/documents', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const body = createDocumentBodySchema.parse(request.body);
    const initialBlocks = emptyBlockDocumentJson();

    if (body.contextId == null) {
      const doc = await prisma.document.create({
        data: {
          title: body.title,
          draftBlocks: initialBlocks,
          contextId: null,
          description: body.description ?? null,
          publishedAt: null,
          createdById: userId,
        },
      });
      const created = await prisma.document.findUniqueOrThrow({
        where: { id: doc.id },
        select: DOCUMENT_CREATE_SELECT,
      });
      await enqueueIncrementalReindexForDocumentSafe(request.log, {
        documentId: doc.id,
        contextId: null,
        trigger: 'document-created',
        warnMessage: 'Failed to enqueue reindex job after document creation',
      });
      return reply.status(201).send(buildCreatedDocumentResponse(created));
    }

    if (
      !(await validateContextWriteAccess(
        prisma,
        userId,
        body.contextId,
        reply,
        'Permission denied to create document in this context'
      ))
    ) {
      return;
    }
    if (!(await validateTagsForContext(prisma, body.contextId, body.tagIds, reply))) {
      return;
    }

    const doc = await prisma.document.create({
      data: {
        title: body.title,
        draftBlocks: initialBlocks,
        contextId: body.contextId,
        description: body.description ?? null,
        publishedAt: null,
        createdById: userId,
      },
    });
    if (body.tagIds.length > 0) {
      await prisma.documentTag.createMany({
        data: body.tagIds.map((tagId) => ({ documentId: doc.id, tagId })),
        skipDuplicates: true,
      });
    }
    const created = await prisma.document.findUniqueOrThrow({
      where: { id: doc.id },
      select: DOCUMENT_CREATE_SELECT,
    });
    await enqueueIncrementalReindexForDocumentSafe(request.log, {
      documentId: doc.id,
      contextId: created.contextId,
      trigger: 'document-created',
      warnMessage: 'Failed to enqueue reindex job after document creation',
    });
    return reply.status(201).send(buildCreatedDocumentResponse(created));
  });
  app.patch(
    '/documents/:documentId',
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const body = updateDocumentBodySchema.parse(request.body);

      if (body.contextId !== undefined && body.contextId !== null) {
        if (
          !(await validateContextWriteAccess(
            prisma,
            userId,
            body.contextId,
            reply,
            'Permission denied to assign document to this context'
          ))
        ) {
          return;
        }
      }

      if (body.tagIds !== undefined && body.tagIds.length > 0) {
        const doc = await prisma.document.findUnique({
          where: { id: documentId },
          select: { contextId: true },
        });
        if (!doc) return reply.status(404).send({ error: 'Document not found' });
        if (doc.contextId == null) {
          return reply
            .status(400)
            .send({ error: 'Document has no context; tags require a context' });
        }
        if (!(await validateTagsForContext(prisma, doc.contextId, body.tagIds, reply))) {
          return;
        }
      }

      const beforeUpdate = await prisma.document.findUnique({
        where: { id: documentId },
        select: {
          publishedAt: true,
          title: true,
          description: true,
          contextId: true,
          documentTags: { select: { tagId: true } },
        },
      });
      if (!beforeUpdate) return reply.status(404).send({ error: 'Document not found' });

      const shouldConsiderReaderNotification =
        beforeUpdate.publishedAt != null && patchTouchesReaderVisibleFields(body);

      try {
        const doc: DocumentMetadataUpdateResult = await updateDocumentMetadata(prisma, documentId, {
          title: body.title,
          contextId: body.contextId,
          description: body.description,
          tagIds: body.tagIds,
        });
        await enqueueIncrementalReindexForDocumentSafe(request.log, {
          documentId,
          contextId: doc.contextId,
          trigger: 'document-updated',
          warnMessage: 'Failed to enqueue reindex job after document update',
        });
        try {
          if (
            shouldConsiderReaderNotification &&
            readerVisibleContentChanged({ before: beforeUpdate, body, after: doc })
          ) {
            const readerIds = excludeUserIds(
              await listUserIdsWhoCanReadDocument(prisma, documentId),
              userId
            );
            await enqueueNotificationEvent({
              eventType: 'document-updated',
              targetUserIds: readerIds,
              payload: { documentId, contextId: doc.contextId, updatedByUserId: userId },
            });
          }
        } catch (error) {
          request.log.warn(
            { error, documentId },
            'Failed to enqueue notification job after document update'
          );
        }
        const mdRow = await prisma.document.findUnique({
          where: { id: documentId },
          select: {
            publishedAt: true,
            draftBlocks: true,
            currentPublishedVersion: { select: { blocks: true } },
          },
        });
        return reply.send({
          ...doc,
          content: mdRow
            ? documentMarkdownFromRow({
                publishedAt: mdRow.publishedAt,
                draftBlocks: mdRow.draftBlocks,
                currentPublishedVersion: mdRow.currentPublishedVersion,
              })
            : '',
          createdByName: doc.createdBy?.name ?? null,
          writers: { users: [], teams: [], departments: [] },
        });
      } catch (err) {
        if (err instanceof DocumentNotFoundError)
          return reply.status(404).send({ error: 'Document not found' });
        if (err instanceof DocumentBusinessError)
          return reply.status(400).send({ error: err.message });
        throw err;
      }
    }
  );
  app.delete(
    '/documents/:documentId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const allowed = await canDeleteDocument(prisma, userId, documentId);
      if (!allowed) {
        return reply.status(403).send({ error: 'Permission denied to delete this document' });
      }
      let notifyTargets: string[] = [];
      try {
        notifyTargets = excludeUserIds(
          await listUserIdsWhoCanReadOrWriteDocument(prisma, documentId),
          userId
        );
      } catch (error) {
        request.log.warn(
          { error, documentId },
          'Failed to resolve notification recipients before document delete'
        );
      }
      await deleteDocument(prisma, documentId);
      await enqueueIncrementalReindexForDocumentSafe(request.log, {
        documentId,
        trigger: 'document-deleted',
        warnMessage: 'Failed to enqueue reindex job after document delete',
      });
      try {
        await enqueueNotificationEvent({
          eventType: 'document-deleted',
          targetUserIds: notifyTargets,
          payload: { documentId, deletedByUserId: userId },
        });
      } catch (error) {
        request.log.warn(
          { error, documentId },
          'Failed to enqueue notification job after document delete'
        );
      }
      return reply.status(204).send();
    }
  );
};
