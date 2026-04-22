import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  requireAuthPreHandler,
  preHandlerWrap,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../auth/middleware.js';
import {
  requireDocumentAccess,
  canDeleteDocument,
  canPublishDocument,
  DOCUMENT_FOR_PERMISSION_INCLUDE,
} from '../permissions/index.js';
import { canSeeDocumentInTrash } from '../permissions/canRead.js';
import {
  publishDocument,
  archiveDocument,
  restoreDocument,
  DocumentNotFoundError,
  DocumentNotPublishableError,
  DocumentAlreadyPublishedError,
  DocumentDeletedError,
  DocumentNotInTrashError,
} from '../services/lifecycle/documentService.js';
import { documentMarkdownFromRow } from '../services/query/documentMarkdownSnapshot.js';
import { blockDocumentV0ToMarkdown } from '../services/blocks/blocksToMarkdown.js';
import { parseBlockDocumentFromDb } from '../services/blocks/documentBlocksBackfill.js';
import { documentIdParamSchema, versionIdParamSchema } from '../schemas/documents.js';
import { routePrismaUserDocumentId } from './collaboration-route-helpers.js';
import { enqueueJob, getJobById } from '../../../infrastructure/jobs/client.js';
import {
  excludeUserIds,
  listUserIdsWhoCanReadDocument,
} from '../../notifications/services/notificationRecipients.js';
import {
  buildPdfDownloadFilename,
  enqueueIncrementalReindexForDocumentSafe,
  enqueueNotificationEvent,
} from '../services/route-support/documentRouteSupport.js';
import { requireStorageAndDocumentAttachment } from './document-attachment-route-helpers.js';

const QUEUE_RETRY_AFTER_SECONDS = 15;
const exportPdfStatusParamsSchema = z.object({
  documentId: z.string().cuid(),
  jobId: z.string().min(1),
});

export const registerPublicationRoutes = (app: FastifyInstance): void => {
  /** GET PDF download: proxy stream for internal object keys; redirect only for absolute external URLs. */
  app.get<{ Params: { documentId: string } }>(
    '/documents/:documentId/pdf',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId } = documentIdParamSchema.parse(request.params);
      const doc = await prisma.document.findFirst({
        where: { id: documentId },
        select: { title: true, pdfUrl: true },
      });
      if (!doc) return reply.status(404).send({ error: 'Document not found' });
      const pdfUrl = doc.pdfUrl?.trim() ?? '';
      if (!pdfUrl) return reply.status(404).send({ error: 'PDF not available' });
      if (/^https?:\/\//i.test(pdfUrl)) {
        return reply.redirect(pdfUrl, 302);
      }
      const storage = request.server.storage;
      if (!storage) return reply.status(503).send({ error: 'Storage not available' });
      const object = await storage.getObject(pdfUrl);
      if (!object) return reply.status(404).send({ error: 'PDF object not found in storage' });
      const filename = buildPdfDownloadFilename(doc.title, documentId);
      reply.header('Content-Type', object.ContentType ?? 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Cache-Control', 'private, max-age=60');
      return reply.send(object.Body);
    }
  );

  /** POST PDF export job: queue background generation and return job id for polling. */
  app.post<{ Params: { documentId: string } }>(
    '/documents/:documentId/export-pdf',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
    },
    async (request, reply) => {
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);

      let jobId: string;
      try {
        jobId = await enqueueJob('documents.export.pdf', {
          documentId,
          requestedByUserId: userId,
        });
      } catch (error) {
        request.log.warn(
          { error, documentId, userId },
          'Queue unavailable while starting PDF export job'
        );
        return reply.header('Retry-After', String(QUEUE_RETRY_AFTER_SECONDS)).status(503).send({
          error: 'Queue/worker currently unavailable. Please retry shortly.',
          code: 'QUEUE_UNAVAILABLE',
        });
      }

      return reply.status(202).send({
        jobId,
        status: 'queued',
      });
    }
  );

  /** GET PDF export job status incl. download URL when completed. */
  app.get<{ Params: { documentId: string; jobId: string } }>(
    '/documents/:documentId/export-pdf/:jobId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId, jobId } = exportPdfStatusParamsSchema.parse(request.params);

      const job = await getJobById('documents.export.pdf', jobId);
      if (!job) {
        return reply.status(404).send({ error: 'Export job not found' });
      }

      const payloadDocumentId =
        typeof job.data === 'object' && job.data != null && 'documentId' in job.data
          ? (job.data.documentId as string)
          : null;
      if (payloadDocumentId !== documentId) {
        return reply.status(404).send({ error: 'Export job not found for document' });
      }

      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { pdfUrl: true },
      });
      if (!doc) return reply.status(404).send({ error: 'Document not found' });

      const state = job.state;
      const isDone = state === 'completed';
      const responseStatus =
        state === 'created' || state === 'retry'
          ? 'queued'
          : state === 'active'
            ? 'running'
            : state === 'completed'
              ? 'succeeded'
              : state === 'failed'
                ? 'failed'
                : state === 'cancelled'
                  ? 'cancelled'
                  : state;

      return reply.send({
        jobId,
        status: responseStatus,
        state,
        completedAt: job.completedOn ?? null,
        failedAt: null,
        pdfReady: isDone && Boolean(doc.pdfUrl),
        downloadUrl: isDone && doc.pdfUrl ? `/api/v1/documents/${documentId}/pdf` : null,
        error:
          state === 'failed' && job.output && typeof job.output === 'object'
            ? 'message' in job.output
              ? (job.output.message as string)
              : 'Job failed'
            : null,
      });
    }
  );

  /** POST Publish – Draft als Version 1 veröffentlichen. Nur canPublishDocument; nur wenn publishedAt null. */
  app.post<{ Params: { documentId: string } }>(
    '/documents/:documentId/publish',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const { prisma, userId, documentId } = routePrismaUserDocumentId(request);

      const allowed = await canPublishDocument(prisma, userId, documentId);
      if (!allowed) {
        return reply.status(403).send({ error: 'Permission denied to publish this document' });
      }

      try {
        await publishDocument(prisma, documentId, userId);
        const doc = await prisma.document.findUnique({
          where: { id: documentId },
          select: {
            id: true,
            title: true,
            draftBlocks: true,
            publishedAt: true,
            pdfUrl: true,
            contextId: true,
            createdAt: true,
            updatedAt: true,
            currentPublishedVersionId: true,
            currentPublishedVersion: { select: { blocks: true } },
            description: true,
            archivedAt: true,
            createdById: true,
            createdBy: { select: { name: true } },
            documentTags: { include: { tag: { select: { id: true, name: true } } } },
          },
        });
        if (!doc) {
          return reply.status(500).send({ error: 'Publish succeeded but document not found' });
        }
        await enqueueIncrementalReindexForDocumentSafe(request.log, {
          documentId,
          contextId: doc.contextId,
          trigger: 'document-updated',
          warnMessage: 'Failed to enqueue reindex job after document publish',
        });
        try {
          const readerIds = excludeUserIds(
            await listUserIdsWhoCanReadDocument(prisma, documentId),
            userId
          );
          await enqueueNotificationEvent({
            eventType: 'document-published',
            targetUserIds: readerIds,
            payload: { documentId, contextId: doc.contextId, publishedByUserId: userId },
          });
        } catch (error) {
          request.log.warn(
            { error, documentId },
            'Failed to enqueue notification job after document publish'
          );
        }
        return reply.send({
          ...doc,
          content: documentMarkdownFromRow({
            publishedAt: doc.publishedAt,
            draftBlocks: doc.draftBlocks,
            currentPublishedVersion: doc.currentPublishedVersion,
          }),
          createdByName: doc.createdBy?.name ?? null,
        });
      } catch (err) {
        if (err instanceof DocumentNotFoundError) {
          return reply.status(404).send({ error: 'Document not found' });
        }
        if (err instanceof DocumentNotPublishableError) {
          return reply.status(400).send({ error: err.message });
        }
        if (err instanceof DocumentAlreadyPublishedError) {
          return reply.status(409).send({ error: 'Document is already published' });
        }
        throw err;
      }
    }
  );

  /** POST Archive – Dokument archivieren (archivedAt setzen). requireDocumentAccess('write'). */
  app.post(
    '/documents/:documentId/archive',
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId } = documentIdParamSchema.parse(request.params);
      try {
        await archiveDocument(prisma, documentId);
        await enqueueIncrementalReindexForDocumentSafe(request.log, {
          documentId,
          trigger: 'document-updated',
          warnMessage: 'Failed to enqueue reindex job after document archive',
        });
        try {
          const actorId = getEffectiveUserId(request as RequestWithUser);
          const readerIds = excludeUserIds(
            await listUserIdsWhoCanReadDocument(prisma, documentId),
            actorId
          );
          await enqueueNotificationEvent({
            eventType: 'document-archived',
            targetUserIds: readerIds,
            payload: { documentId, archivedByUserId: actorId },
          });
        } catch (error) {
          request.log.warn(
            { error, documentId },
            'Failed to enqueue notification job after document archive'
          );
        }
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof DocumentNotFoundError) {
          return reply.status(404).send({ error: 'Document not found' });
        }
        if (err instanceof DocumentDeletedError) {
          return reply.status(400).send({ error: 'Document is deleted' });
        }
        throw err;
      }
    }
  );

  /** GET Versionsliste – nur für Nutzer mit Schreibrecht am Dokument. */
  app.get<{ Params: { documentId: string } }>(
    '/documents/:documentId/versions',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId } = documentIdParamSchema.parse(request.params);
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true },
      });
      if (!doc) return reply.status(404).send({ error: 'Document not found' });

      const versions = await prisma.documentVersion.findMany({
        where: { documentId },
        orderBy: { versionNumber: 'desc' },
        select: {
          id: true,
          versionNumber: true,
          createdAt: true,
          createdById: true,
          createdBy: { select: { name: true } },
        },
      });
      const items = versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        createdAt: v.createdAt,
        createdById: v.createdById ?? null,
        createdByName: v.createdBy?.name ?? null,
      }));
      return reply.send({ items });
    }
  );

  /** GET Einzelversion – nur für Nutzer mit Schreibrecht am Dokument. */
  app.get<{ Params: { documentId: string; versionId: string } }>(
    '/documents/:documentId/versions/:versionId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))],
    },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { documentId, versionId } = versionIdParamSchema.parse(request.params);

      const version = await prisma.documentVersion.findFirst({
        where: { id: versionId, documentId },
        select: {
          id: true,
          documentId: true,
          blocks: true,
          blocksSchemaVersion: true,
          versionNumber: true,
          createdAt: true,
          createdById: true,
          createdBy: { select: { name: true } },
        },
      });
      if (!version) return reply.status(404).send({ error: 'Version not found' });

      const versionBlocks = parseBlockDocumentFromDb(version.blocks);
      return reply.send({
        id: version.id,
        documentId: version.documentId,
        content: versionBlocks ? blockDocumentV0ToMarkdown(versionBlocks) : '',
        blocks: versionBlocks,
        blocksSchemaVersion: version.blocksSchemaVersion ?? null,
        versionNumber: version.versionNumber,
        createdAt: version.createdAt,
        createdById: version.createdById ?? null,
        createdByName: version.createdBy?.name ?? null,
      });
    }
  );

  /** POST Dokument aus Papierkorb wiederherstellen. Wenn Kontext trashed: abkoppeln (contextId = null) als Draft; sonst nur deletedAt = null. */
  app.post(
    '/documents/:documentId/restore',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        include: DOCUMENT_FOR_PERMISSION_INCLUDE,
      });
      if (!doc) return reply.status(404).send({ error: 'Document not found' });
      if (doc.deletedAt == null) {
        return reply.status(400).send({ error: 'Not in trash' });
      }
      const allowed =
        (await canDeleteDocument(prisma, userId, documentId)) ||
        (await canSeeDocumentInTrash(prisma, userId, doc));
      if (!allowed) {
        return reply.status(403).send({ error: 'Permission denied to restore this document' });
      }
      try {
        await restoreDocument(prisma, documentId);
        await enqueueIncrementalReindexForDocumentSafe(request.log, {
          documentId,
          trigger: 'document-updated',
          warnMessage: 'Failed to enqueue reindex job after document restore',
        });
        try {
          const readerIds = excludeUserIds(
            await listUserIdsWhoCanReadDocument(prisma, documentId),
            userId
          );
          await enqueueNotificationEvent({
            eventType: 'document-restored',
            targetUserIds: readerIds,
            payload: { documentId, restoredByUserId: userId },
          });
        } catch (error) {
          request.log.warn(
            { error, documentId },
            'Failed to enqueue notification job after document restore'
          );
        }
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof DocumentNotFoundError)
          return reply.status(404).send({ error: 'Document not found' });
        if (err instanceof DocumentNotInTrashError)
          return reply.status(400).send({ error: 'Not in trash' });
        throw err;
      }
    }
  );

  /** GET Attachment file: redirect to presigned URL. */
  app.get<{ Params: { documentId: string; attachmentId: string } }>(
    '/documents/:documentId/attachments/:attachmentId',
    {
      preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))],
    },
    async (request, reply) => {
      const loaded = await requireStorageAndDocumentAttachment(request, reply);
      if (!loaded) return;
      const { storage, attachment } = loaded;
      const presigned = await storage.getPresignedGetUrl(attachment.objectKey, 60);
      return reply.redirect(presigned, 302);
    }
  );
};
