import type { PrismaClient } from '../../../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';
import { renderMarkdownToPdfBuffer } from '../pdf/typstPdfExport.js';
import { jobPayloadSchemas, type JobPayloadByType, type JobType } from './jobTypes.js';
import { initStorage, type StorageService } from '../storage/index.js';
import { canWrite } from '../../domains/documents/permissions/canWrite.js';
import {
  runFullReindex,
  runIncrementalReindex,
} from '../../domains/search/services/searchIndexService.js';
import { dispatchNotificationEvent } from '../../domains/notifications/services/notificationDispatchService.js';
import { runUserNotificationRetention } from '../../domains/notifications/services/notificationRetentionService.js';
import { backfillAllDocumentBlocks } from '../../domains/documents/services/blocks/documentBlocksBackfill.js';
import { documentMarkdownFromRow } from '../../domains/documents/services/query/documentMarkdownSnapshot.js';
import { runOperationalBackup } from '../../domains/admin/services/operationalBackupService.js';
import { runApplySystemUpdate } from '../../domains/admin/services/adminSystemUpdateApplyService.js';
import { runWatchSystemUpdate } from '../../domains/admin/services/adminSystemUpdateWatchService.js';
import { runOperationalRestore } from '../../domains/admin/services/operationalRestoreService.js';
import { runPlatformExport } from '../../domains/admin/services/platformExportService.js';
import { runPlatformImport } from '../../domains/admin/services/platformImportService.js';
import { deliverAdminBroadcastById } from '../../domains/admin/services/adminBroadcastNotificationService.js';

let storagePromise: Promise<StorageService | null> | null = null;

async function getStorage(): Promise<StorageService | null> {
  if (storagePromise == null) {
    storagePromise = initStorage();
  }
  return storagePromise;
}

export type JobLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

export type JobContext = {
  prisma: PrismaClient;
  logger: JobLogger;
};

export type JobDefinition<K extends JobType = JobType> = {
  name: K;
  schema: (typeof jobPayloadSchemas)[K];
  retryLimit: number;
  handler: (payload: JobPayloadByType[K], context: JobContext) => Promise<void>;
};

function notImplementedHandler(
  jobName: JobType,
  payload: JobPayloadByType[JobType],
  context: JobContext
): Promise<void> {
  context.logger.info({ jobName, payload }, 'Job received (handler not implemented yet)');
  return Promise.resolve();
}

async function exportDocumentToPdf(
  payload: JobPayloadByType['documents.export.pdf'],
  context: JobContext
): Promise<void> {
  const canExport = await canWrite(context.prisma, payload.requestedByUserId, payload.documentId);
  if (!canExport) {
    throw new Error('Permission denied for PDF export');
  }

  const document = await context.prisma.document.findFirst({
    where: { id: payload.documentId, deletedAt: null },
    select: {
      id: true,
      title: true,
      publishedAt: true,
      draftBlocks: true,
      currentPublishedVersion: { select: { blocks: true } },
    },
  });
  if (!document) {
    throw new Error('Document not found');
  }
  const markdownBody = documentMarkdownFromRow({
    publishedAt: document.publishedAt,
    draftBlocks: document.draftBlocks,
    currentPublishedVersion: document.currentPublishedVersion,
  });

  const storage = await getStorage();
  if (!storage) {
    throw new Error('Storage not available');
  }

  const pdfBuffer = await renderMarkdownToPdfBuffer({
    markdown: markdownBody,
    title: document.title,
  });

  const objectKey = `exports/documents/${document.id}/${Date.now()}-${randomUUID()}.pdf`;
  await storage.uploadStream(objectKey, pdfBuffer, 'application/pdf');

  await context.prisma.document.update({
    where: { id: document.id },
    data: { pdfUrl: objectKey },
  });

  context.logger.info(
    { documentId: document.id, objectKey },
    'Stored exported PDF and updated document.pdfUrl'
  );
}

async function reindexIncremental(
  payload: JobPayloadByType['search.reindex.incremental'],
  context: JobContext
): Promise<void> {
  const result = await runIncrementalReindex(context.prisma, payload);
  context.logger.info({ payload, result }, 'Incremental search reindex completed');
}

async function reindexFull(
  payload: JobPayloadByType['search.reindex.full'],
  context: JobContext
): Promise<void> {
  const result = await runFullReindex(context.prisma);
  context.logger.info({ payload, result }, 'Full search reindex completed');
}

async function sendNotifications(
  payload: JobPayloadByType['notifications.send'],
  context: JobContext
): Promise<void> {
  const result = await dispatchNotificationEvent(context.prisma, payload);
  context.logger.info(
    { eventType: payload.eventType, targetUserIds: payload.targetUserIds, result },
    'Notification dispatch completed'
  );
}

async function sendScheduledAdminBroadcast(
  payload: JobPayloadByType['notifications.admin-broadcast'],
  context: JobContext
): Promise<void> {
  const result = await deliverAdminBroadcastById(context.prisma, payload.broadcastId);
  context.logger.info({ payload, result }, 'Scheduled admin broadcast delivered');
}

async function maintenanceCleanup(
  payload: JobPayloadByType['maintenance.cleanup'],
  context: JobContext
): Promise<void> {
  if (payload.task === 'user-notifications-retention') {
    const deleted = await runUserNotificationRetention(context.prisma);
    context.logger.info({ task: payload.task, deleted }, 'maintenance.cleanup completed');
    return;
  }
  await notImplementedHandler('maintenance.cleanup', payload, context);
}

async function maintenanceBackup(
  payload: JobPayloadByType['maintenance.backup'],
  context: JobContext
): Promise<void> {
  const normalized: JobPayloadByType['maintenance.backup'] =
    payload && typeof payload === 'object' && 'mode' in payload ? payload : { mode: 'schedule' };
  await runOperationalBackup(context.prisma, normalized, context.logger);
  context.logger.info({ payload: normalized }, 'maintenance.backup completed');
}

async function maintenanceApplyUpdate(
  payload: JobPayloadByType['maintenance.apply-update'],
  context: JobContext
): Promise<void> {
  await runApplySystemUpdate(context.prisma, payload, context.logger);
  context.logger.info({ payload }, 'maintenance.apply-update completed');
}

async function maintenanceWatchUpdate(
  payload: JobPayloadByType['maintenance.watch-update'],
  context: JobContext
): Promise<void> {
  await runWatchSystemUpdate(context.prisma, payload, context.logger);
  context.logger.info({ payload }, 'maintenance.watch-update completed');
}

async function maintenanceRestore(
  payload: JobPayloadByType['maintenance.restore'],
  context: JobContext
): Promise<void> {
  await runOperationalRestore(context.prisma, payload, context.logger);
  context.logger.info({ payload }, 'maintenance.restore completed');
}

async function backfillDocumentBlocksJob(
  payload: JobPayloadByType['documents.blocks.backfill'],
  context: JobContext
): Promise<void> {
  const result = await backfillAllDocumentBlocks(context.prisma, {
    documentId: payload.documentId,
    limit: payload.limit ?? 200,
  });
  for (const documentId of result.affectedDocumentIds) {
    try {
      await runIncrementalReindex(context.prisma, {
        documentId,
        trigger: 'manual',
      });
    } catch (error) {
      context.logger.warn(
        { error, documentId },
        'Incremental search reindex after blocks backfill failed'
      );
    }
  }
  context.logger.info({ payload, result }, 'documents.blocks.backfill completed');
}

async function maintenancePlatformExport(
  payload: JobPayloadByType['maintenance.platform-export'],
  context: JobContext
): Promise<void> {
  await runPlatformExport(context.prisma, payload, context.logger);
  context.logger.info({ payload }, 'maintenance.platform-export completed');
}

async function maintenancePlatformImport(
  payload: JobPayloadByType['maintenance.platform-import'],
  context: JobContext
): Promise<void> {
  await runPlatformImport(context.prisma, payload, context.logger);
  context.logger.info({ payload }, 'maintenance.platform-import completed');
}

export const jobDefinitions: ReadonlyArray<JobDefinition> = [
  {
    name: 'documents.export.pdf',
    schema: jobPayloadSchemas['documents.export.pdf'],
    retryLimit: 3,
    handler: (payload, context) =>
      exportDocumentToPdf(payload as JobPayloadByType['documents.export.pdf'], context),
  },
  {
    name: 'search.reindex.incremental',
    schema: jobPayloadSchemas['search.reindex.incremental'],
    retryLimit: 5,
    handler: (payload, context) =>
      reindexIncremental(payload as JobPayloadByType['search.reindex.incremental'], context),
  },
  {
    name: 'search.reindex.full',
    schema: jobPayloadSchemas['search.reindex.full'],
    retryLimit: 3,
    handler: (payload, context) =>
      reindexFull(payload as JobPayloadByType['search.reindex.full'], context),
  },
  {
    name: 'notifications.send',
    schema: jobPayloadSchemas['notifications.send'],
    retryLimit: 5,
    handler: (payload, context) =>
      sendNotifications(payload as JobPayloadByType['notifications.send'], context),
  },
  {
    name: 'notifications.admin-broadcast',
    schema: jobPayloadSchemas['notifications.admin-broadcast'],
    retryLimit: 3,
    handler: (payload, context) =>
      sendScheduledAdminBroadcast(
        payload as JobPayloadByType['notifications.admin-broadcast'],
        context
      ),
  },
  {
    name: 'maintenance.cleanup',
    schema: jobPayloadSchemas['maintenance.cleanup'],
    retryLimit: 2,
    handler: (payload, context) =>
      maintenanceCleanup(payload as JobPayloadByType['maintenance.cleanup'], context),
  },
  {
    name: 'documents.blocks.backfill',
    schema: jobPayloadSchemas['documents.blocks.backfill'],
    retryLimit: 1,
    handler: (payload, context) =>
      backfillDocumentBlocksJob(payload as JobPayloadByType['documents.blocks.backfill'], context),
  },
  {
    name: 'maintenance.backup',
    schema: jobPayloadSchemas['maintenance.backup'],
    retryLimit: 0,
    handler: (payload, context) =>
      maintenanceBackup(payload as JobPayloadByType['maintenance.backup'], context),
  },
  {
    name: 'maintenance.apply-update',
    schema: jobPayloadSchemas['maintenance.apply-update'],
    retryLimit: 0,
    handler: (payload, context) =>
      maintenanceApplyUpdate(payload as JobPayloadByType['maintenance.apply-update'], context),
  },
  {
    name: 'maintenance.watch-update',
    schema: jobPayloadSchemas['maintenance.watch-update'],
    retryLimit: 5,
    handler: (payload, context) =>
      maintenanceWatchUpdate(payload as JobPayloadByType['maintenance.watch-update'], context),
  },
  {
    name: 'maintenance.restore',
    schema: jobPayloadSchemas['maintenance.restore'],
    retryLimit: 0,
    handler: (payload, context) =>
      maintenanceRestore(payload as JobPayloadByType['maintenance.restore'], context),
  },
  {
    name: 'maintenance.platform-export',
    schema: jobPayloadSchemas['maintenance.platform-export'],
    retryLimit: 0,
    handler: (payload, context) =>
      maintenancePlatformExport(
        payload as JobPayloadByType['maintenance.platform-export'],
        context
      ),
  },
  {
    name: 'maintenance.platform-import',
    schema: jobPayloadSchemas['maintenance.platform-import'],
    retryLimit: 0,
    handler: (payload, context) =>
      maintenancePlatformImport(
        payload as JobPayloadByType['maintenance.platform-import'],
        context
      ),
  },
];
