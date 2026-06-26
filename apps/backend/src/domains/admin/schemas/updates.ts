import { z } from 'zod';

export const adminUpdateRunSchema = z.object({
  id: z.string(),
  status: z.enum(['queued', 'backing_up', 'applying', 'succeeded', 'failed']),
  targetVersion: z.string(),
  targetReleaseTag: z.string(),
  backupRunId: z.string().nullable(),
  errorMessage: z.string().nullable(),
  agentPhase: z.string().nullable(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type AdminUpdateRun = z.infer<typeof adminUpdateRunSchema>;

export const adminUpdateApplyResponseSchema = z.object({
  updateRunId: z.string(),
  status: z.literal('backing_up'),
});

export type AdminUpdateApplyResponse = z.infer<typeof adminUpdateApplyResponseSchema>;
