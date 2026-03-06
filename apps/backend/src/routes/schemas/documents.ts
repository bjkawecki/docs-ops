import { z } from 'zod';
import { paginationQuerySchema } from './organisation.js';

export { paginationQuerySchema };

function normalizeToCuidArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (v === undefined || v === '') return [];
  if (typeof v === 'string') return [v];
  return [];
}
const cuidArray = z.preprocess(normalizeToCuidArray, z.array(z.string().cuid()));

/** Query: GET /documents (catalog list) – pagination + filters. */
export const catalogDocumentsQuerySchema = paginationQuerySchema.extend({
  contextType: z.enum(['process', 'project']).optional(),
  companyId: z.string().cuid().optional(),
  departmentId: z.string().cuid().optional(),
  teamId: z.string().cuid().optional(),
  tagIds: cuidArray.optional().default([]),
  search: z.string().min(1).optional(),
});

/** Params: contextId. */
export const contextIdParamSchema = z.object({
  contextId: z.cuid(),
});

/** Params: documentId. */
export const documentIdParamSchema = z.object({
  documentId: z.cuid(),
});

/** Params: documentId + versionId (for version routes). */
export const versionIdParamSchema = z.object({
  documentId: z.cuid(),
  versionId: z.cuid(),
});

/** Params: documentId + attachmentId (for attachment routes). */
export const attachmentIdParamSchema = z.object({
  documentId: z.cuid(),
  attachmentId: z.cuid(),
});

/** Params: draftRequestId (for PATCH draft-requests). */
export const draftRequestIdParamSchema = z.object({
  draftRequestId: z.cuid(),
});

/** Body: Create draft request (PR). */
export const createDraftRequestBodySchema = z.object({
  draftContent: z.string(),
  targetVersionId: z.string().cuid().optional(),
});

/** Body: PUT document draft (upsert user's draft). */
export const putDraftBodySchema = z.object({
  content: z.string(),
  /** When set to currentPublishedVersionId, marks draft as based on latest version (e.g. after update-to-latest). */
  basedOnVersionId: z.string().cuid().optional(),
});

/** Body: PATCH draft-request (merge or reject). */
export const patchDraftRequestBodySchema = z.object({
  action: z.enum(['merge', 'reject']),
  comment: z.string().max(2000).optional(),
});

/** Query: GET draft-requests – optional status filter. */
export const draftRequestsQuerySchema = z.object({
  status: z.enum(['open', 'merged', 'rejected']).optional(),
});

/** Response: POST draft/update-to-latest – either upToDate or merge result. */
export const updateToLatestResponseSchema = z.discriminatedUnion('upToDate', [
  z.object({ upToDate: z.literal(true) }),
  z.object({
    mergedContent: z.string(),
    hasConflicts: z.boolean(),
  }),
]);

/** Body: Dokument anlegen. contextId optional = context-free draft (only creator visible). */
export const createDocumentBodySchema = z
  .object({
    title: z.string().min(1).max(500),
    content: z.string(),
    contextId: z.string().cuid().optional(),
    tagIds: z.array(z.cuid()).optional().default([]),
    description: z.string().max(500).trim().optional(),
    publishedAt: z.coerce.date().optional(),
  })
  .refine((data) => data.contextId != null || data.tagIds.length === 0, {
    message: 'tagIds not allowed when creating a context-free draft (no contextId)',
  })
  .refine((data) => data.contextId != null || data.publishedAt == null, {
    message: 'publishedAt not allowed when creating a context-free draft (no contextId)',
  });

/** Body: Dokument aktualisieren. contextId setzbar (null → Kontext für Veröffentlichung). */
export const updateDocumentBodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  contextId: z.string().cuid().optional().nullable(),
  tagIds: z.array(z.cuid()).optional(),
  description: z.string().max(500).trim().optional().nullable(),
  publishedAt: z.coerce.date().optional().nullable(),
});

/** Grant-Rolle (API: String). */
export const grantRoleSchema = z.enum(['Read', 'Write']);

/** Einzelner User-Grant. */
export const grantUserEntrySchema = z.object({
  userId: z.cuid(),
  role: grantRoleSchema,
});
/** Body: User-Grants ersetzen. */
export const putGrantsUsersBodySchema = z.object({
  grants: z.array(grantUserEntrySchema),
});

/** Einzelner Team-Grant. */
export const grantTeamEntrySchema = z.object({
  teamId: z.cuid(),
  role: grantRoleSchema,
});
/** Body: Team-Grants ersetzen. */
export const putGrantsTeamsBodySchema = z.object({
  grants: z.array(grantTeamEntrySchema),
});

/** Einzelner Department-Grant. */
export const grantDepartmentEntrySchema = z.object({
  departmentId: z.cuid(),
  role: grantRoleSchema,
});
/** Body: Department-Grants ersetzen. */
export const putGrantsDepartmentsBodySchema = z.object({
  grants: z.array(grantDepartmentEntrySchema),
});

/** Params: tagId. */
export const tagIdParamSchema = z.object({
  tagId: z.string().cuid(),
});

/** Query: GET /tags – Scope via ownerId oder contextId (mindestens einer nötig). */
export const getTagsQuerySchema = z.object({
  ownerId: z.string().cuid().optional(),
  contextId: z.string().cuid().optional(),
});

/** Body: Tag anlegen (scope-gebunden). ownerId oder contextId (wird auf ownerId aufgelöst). */
export const createTagBodySchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(100)
      .transform((s) => s.trim()),
    ownerId: z.string().cuid().optional(),
    contextId: z.string().cuid().optional(),
  })
  .refine((data) => data.ownerId != null || data.contextId != null, {
    message: 'ownerId or contextId is required',
  });
