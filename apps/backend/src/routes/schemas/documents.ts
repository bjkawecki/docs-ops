import { z } from 'zod';
import { paginationQuerySchema } from './organisation.js';

export { paginationQuerySchema };

/** Params: contextId. */
export const contextIdParamSchema = z.object({
  contextId: z.cuid(),
});

/** Params: documentId. */
export const documentIdParamSchema = z.object({
  documentId: z.cuid(),
});

/** Body: Dokument anlegen. */
export const createDocumentBodySchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string(),
  contextId: z.cuid(),
  tagIds: z.array(z.cuid()).optional().default([]),
});

/** Body: Dokument aktualisieren. */
export const updateDocumentBodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  tagIds: z.array(z.cuid()).optional(),
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
