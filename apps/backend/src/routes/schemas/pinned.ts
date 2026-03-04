import { z } from 'zod';

export const pinnedScopeTypeSchema = z.enum(['team', 'department', 'company']);

/** Query: GET /pinned – optional filter by scope. */
export const listPinnedQuerySchema = z.object({
  scopeType: pinnedScopeTypeSchema.optional(),
  scopeId: z.string().min(1).optional(),
});

/** Params: pinned item id. */
export const pinnedIdParamSchema = z.object({
  id: z.string().cuid(),
});

/** Body: Document in Scope anpinnen. */
export const createPinnedBodySchema = z.object({
  scopeType: pinnedScopeTypeSchema,
  scopeId: z.string().min(1),
  documentId: z.string().cuid(),
  order: z.number().int().min(0).optional(),
});
