import type { PrismaClient } from '../../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { jobPayloadSchemas, type JobPayloadByType, type JobType } from './jobTypes.js';
import { initStorage, type StorageService } from '../storage/index.js';
import { canWrite } from '../permissions/canWrite.js';
import { runFullReindex, runIncrementalReindex } from '../services/searchIndexService.js';
import { dispatchNotificationEvent } from '../services/notificationDispatchService.js';
import { runUserNotificationRetention } from '../services/notificationRetentionService.js';

const execFileAsync = promisify(execFile);

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
    select: { id: true, title: true, content: true },
  });
  if (!document) {
    throw new Error('Document not found');
  }

  const storage = await getStorage();
  if (!storage) {
    throw new Error('Storage not available');
  }

  const workDir = await mkdtemp(join(tmpdir(), 'docsops-export-'));
  const inputPath = join(workDir, 'input.md');
  const outputPath = join(workDir, 'output.pdf');

  try {
    await writeFile(inputPath, document.content, 'utf8');
    const pandocCommand = process.env.PANDOC_BIN?.trim() || 'pandoc';
    const pandocExtraArgs = (process.env.PANDOC_ARGS ?? '')
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    try {
      await execFileAsync(pandocCommand, [inputPath, ...pandocExtraArgs, '-o', outputPath], {
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      });
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? (error as { code?: string }).code
          : undefined;
      if (code === 'ENOENT') {
        throw new Error(
          `Pandoc binary not found ("${pandocCommand}"). Rebuild the app/worker image or set PANDOC_BIN to a valid executable path.`
        );
      }
      throw error;
    }

    const pdfBuffer = await readFile(outputPath);
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
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
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
    name: 'maintenance.cleanup',
    schema: jobPayloadSchemas['maintenance.cleanup'],
    retryLimit: 2,
    handler: (payload, context) =>
      maintenanceCleanup(payload as JobPayloadByType['maintenance.cleanup'], context),
  },
];
