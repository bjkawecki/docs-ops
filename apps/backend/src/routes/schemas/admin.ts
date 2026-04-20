import { z } from 'zod';

/** Sortable fields for GET /admin/users (DB columns + relation-based). */
export const adminUsersSortBySchema = z.enum([
  'name',
  'email',
  'isAdmin',
  'deletedAt',
  'role',
  'teams',
  'departments',
]);

/** Query: GET /admin/users – Pagination + Filter + Suche + Sortierung. */
export const listUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  includeDeactivated: z.coerce.boolean().optional().default(false),
  search: z.string().min(1).max(255).optional(),
  sortBy: adminUsersSortBySchema.optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** Body: POST /admin/users – Nutzer anlegen. */
export const createUserBodySchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(255),
  isAdmin: z.boolean().optional().default(false),
});

export type CreateUserBody = z.infer<typeof createUserBodySchema>;

/** Body: PATCH /admin/users/:userId – Nutzer bearbeiten / Deaktivierung / Reaktivierung. */
export const updateUserBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().nullable().optional(),
  isAdmin: z.boolean().optional(),
  deletedAt: z.union([z.string().datetime(), z.null()]).optional(),
});

export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;

/** Body: POST /admin/users/:userId/reset-password. */
export const resetPasswordBodySchema = z.object({
  newPassword: z.string().min(8).max(255),
});

export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;

/** Params: userId. */
export const userIdParamSchema = z.object({
  userId: z.string().cuid(),
});

/** Query: GET /admin/users/:userId/documents – Pagination + optional search. */
export const listUserDocumentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().min(1).max(255).optional(),
});

export type ListUserDocumentsQuery = z.infer<typeof listUserDocumentsQuerySchema>;

/** Body: POST /admin/impersonate – Ansicht als Nutzer (Ziel-User-ID). */
export const impersonateBodySchema = z.object({
  userId: z.string().min(1),
});

export type ImpersonateBody = z.infer<typeof impersonateBodySchema>;

export const listAdminJobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  jobName: z.string().min(1).optional(),
  state: z
    .enum(['created', 'retry', 'active', 'completed', 'cancelled', 'failed', 'expired'])
    .optional(),
  requestedByUserId: z.string().cuid().optional(),
  search: z.string().min(1).max(255).optional(),
});

export const adminJobIdParamSchema = z.object({
  jobId: z.string().uuid(),
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
        code: z.ZodIssueCode.custom,
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
