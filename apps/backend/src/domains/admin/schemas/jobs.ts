import { z } from 'zod';

export const listAdminJobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  jobName: z.string().min(1).optional(),
  state: z
    .enum(['created', 'retry', 'active', 'completed', 'cancelled', 'failed', 'expired'])
    .optional(),
  requestedByUserId: z.cuid().optional(),
  search: z.string().min(1).max(255).optional(),
});

export const adminJobIdParamSchema = z.object({
  jobId: z.uuid(),
});

export const adminJobNameParamSchema = z.object({
  jobName: z.string().min(1).max(255),
});

export const patchAdminScheduleBodySchema = z
  .object({
    enabled: z.boolean(),
    cron: z.string().min(1).optional(),
    tz: z.string().min(1).optional(),
    key: z.string().min(1).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.enabled && !value.cron) {
      ctx.addIssue({
        code: 'custom',
        path: ['cron'],
        message: 'cron is required when enabled=true',
      });
    }
  });

export const retryFailedJobsBodySchema = z.object({
  jobName: z.string().min(1).max(255).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export const listAdminJobAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  action: z
    .enum([
      'job-retry',
      'job-cancel',
      'job-delete',
      'job-retry-failed-batch',
      'schedule-upsert',
      'schedule-remove',
    ])
    .optional(),
  status: z.enum(['success', 'failed']).optional(),
});
