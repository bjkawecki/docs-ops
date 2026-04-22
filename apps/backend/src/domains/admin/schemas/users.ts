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

/** Body: POST /admin/users – Nutzer anlegen. */
export const createUserBodySchema = z.object({
  name: z.string().min(1).max(255),
  email: z.email(),
  password: z.string().min(8).max(255),
  isAdmin: z.boolean().optional().default(false),
});

/** Body: PATCH /admin/users/:userId – Nutzer bearbeiten / Deaktivierung / Reaktivierung. */
export const updateUserBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.email().nullable().optional(),
  isAdmin: z.boolean().optional(),
  deletedAt: z.union([z.iso.datetime(), z.null()]).optional(),
});

/** Body: POST /admin/users/:userId/reset-password. */
export const resetPasswordBodySchema = z.object({
  newPassword: z.string().min(8).max(255),
});

/** Params: userId. */
export const userIdParamSchema = z.object({
  userId: z.cuid(),
});

/** Query: GET /admin/users/:userId/documents – Pagination + optional search. */
export const listUserDocumentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().min(1).max(255).optional(),
});
