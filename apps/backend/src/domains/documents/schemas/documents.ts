import { z } from 'zod';
import { DocumentSuggestionStatus } from '../../../../generated/prisma/client.js';
import { blockDocumentSchemaV0 } from '../services/blockSchema.js';
import { paginationQuerySchema } from '../../organisation/schemas/organisation.js';

export { paginationQuerySchema };

function normalizeToCuidArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (v === undefined || v === '') return [];
  if (typeof v === 'string') return [v];
  return [];
}
const cuidArray = z.preprocess(normalizeToCuidArray, z.array(z.string().cuid()));

/** Query: GET /documents (catalog list) – pagination + filters + sort. */
export const catalogDocumentsQuerySchema = paginationQuerySchema.extend({
  contextType: z.enum(['process', 'project']).optional(),
  companyId: z.cuid().optional(),
  departmentId: z.cuid().optional(),
  teamId: z.cuid().optional(),
  tagIds: cuidArray.optional().default([]),
  search: z.string().min(1).optional(),
  /** If true, only return documents that have been published (publishedAt set). */
  publishedOnly: z.coerce.boolean().optional().default(false),
  sortBy: z
    .enum([
      'title',
      'updatedAt',
      'createdAt',
      'contextName',
      'contextType',
      'ownerDisplay',
      'relevance',
    ])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
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

/** Params: documentId + suggestionId (Suggestions, EPIC-5). */
export const suggestionIdParamSchema = z.object({
  documentId: z.cuid(),
  suggestionId: z.cuid(),
});

/** Params: documentId + attachmentId (for attachment routes). */
export const attachmentIdParamSchema = z.object({
  documentId: z.cuid(),
  attachmentId: z.cuid(),
});

/** Body: Dokument anlegen (immer als Draft). contextId optional = context-free draft (only creator visible). */
export const createDocumentBodySchema = z
  .object({
    title: z.string().min(1).max(500),
    contextId: z.string().cuid().optional(),
    tagIds: z.array(z.cuid()).optional().default([]),
    description: z.string().max(500).trim().optional(),
  })
  .refine((data) => data.contextId != null || data.tagIds.length === 0, {
    message: 'tagIds not allowed when creating a context-free draft (no contextId)',
  });

/** Body: Dokument-Metadaten aktualisieren (title, contextId, description, tagIds). Lifecycle nur über dedizierte Endpoints. */
export const updateDocumentBodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  contextId: z.string().cuid().optional().nullable(),
  tagIds: z.array(z.cuid()).optional(),
  description: z.string().max(500).trim().optional().nullable(),
});

/** Body: PATCH Lead-Draft (Block-JSON); Optimistic Lock über `expectedRevision` (optional abgestimmt mit If-Match). */
export const patchLeadDraftBodySchema = z.object({
  expectedRevision: z.number().int().min(0),
  blocks: blockDocumentSchemaV0,
});

/** Query: GET …/suggestions – optional nach Status filtern. */
export const listDocumentSuggestionsQuerySchema = z.object({
  status: z.nativeEnum(DocumentSuggestionStatus).optional(),
});

/** Body: POST …/suggestions (Autor). */
export const createDocumentSuggestionBodySchema = z.object({
  baseDraftRevision: z.number().int().min(0),
  ops: z.unknown(),
  publishedVersionId: z.string().cuid().optional().nullable(),
});

/** Body: POST accept/reject (Lead, optional Kommentar). */
export const resolveDocumentSuggestionBodySchema = z.object({
  comment: z.string().max(5000).trim().optional().nullable(),
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

const DOCUMENT_COMMENT_TEXT_MAX = 16_000;

/** Params: documentId + commentId. */
export const documentCommentIdParamSchema = z.object({
  documentId: z.string().cuid(),
  commentId: z.string().cuid(),
});

/** Body: POST document comment. */
export const createDocumentCommentBodySchema = z
  .object({
    text: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1).max(DOCUMENT_COMMENT_TEXT_MAX)),
    parentId: z.string().cuid().optional(),
    /** Heading slug from document markdown; only for top-level comments. */
    anchorHeadingId: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine((d) => d.parentId == null || d.anchorHeadingId == null, {
    message: 'anchorHeadingId is only allowed on top-level comments',
    path: ['anchorHeadingId'],
  });

/** Body: PATCH document comment (author only). */
export const patchDocumentCommentBodySchema = z
  .object({
    text: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1).max(DOCUMENT_COMMENT_TEXT_MAX))
      .optional(),
    anchorHeadingId: z.union([z.string().min(1).max(200), z.null()]).optional(),
  })
  .refine((d) => d.text !== undefined || d.anchorHeadingId !== undefined, {
    message: 'Provide text and/or anchorHeadingId',
  });
