import { z } from 'zod';

/** Sortable fields for GET /admin/users (DB columns). */
export const adminUsersSortBySchema = z.enum(['name', 'email', 'isAdmin', 'deletedAt']);

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
