import { z } from 'zod';

export const jobPayloadSchemas = {
  'documents.export.pdf': z.object({
    documentId: z.cuid(),
    requestedByUserId: z.cuid(),
  }),
  'search.reindex.incremental': z.object({
    contextId: z.cuid().optional(),
    documentId: z.cuid().optional(),
    trigger: z.enum(['document-created', 'document-updated', 'document-deleted', 'manual']),
  }),
  'search.reindex.full': z.object({
    requestedByUserId: z.cuid().optional(),
    reason: z.enum(['scheduled', 'manual']).default('scheduled'),
  }),
  'notifications.send': z.object({
    eventType: z.string().min(1).max(120),
    targetUserIds: z.array(z.cuid()).max(1000),
    payload: z.record(z.string(), z.unknown()).default({}),
  }),
  'maintenance.cleanup': z.object({
    task: z.enum([
      'temporary-assets',
      'failed-jobs',
      'orphaned-exports',
      'user-notifications-retention',
    ]),
    requestedByUserId: z.cuid().optional(),
  }),
  /** EPIC-3: Markdown → Block-JSON für `DocumentVersion.blocks` und `Document.draftBlocks` (idempotent). */
  'documents.blocks.backfill': z.object({
    documentId: z.cuid().optional(),
    limit: z.number().int().positive().max(500).optional(),
  }),
} as const;

export type JobType = keyof typeof jobPayloadSchemas;

export type JobPayloadByType = {
  [K in JobType]: z.infer<(typeof jobPayloadSchemas)[K]>;
};

export const jobTypes = Object.freeze(Object.keys(jobPayloadSchemas) as JobType[]);
