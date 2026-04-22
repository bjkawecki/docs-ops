import { z } from 'zod';
import { paginationQuerySchema, type PaginationQuery } from './organisation.js';

export { paginationQuerySchema };
export type { PaginationQuery };

/** Query: Liste Prozesse (Pagination + optional nach Company/Department/Team/User filtern). */
export const processListQuerySchema = paginationQuerySchema.extend({
  companyId: z.cuid().optional(),
  departmentId: z.cuid().optional(),
  teamId: z.cuid().optional(),
  ownerUserId: z.enum(['me']).optional(),
});

/** Query: Liste Projekte (Pagination + optional nach Company/Department/Team/User filtern). */
export const projectListQuerySchema = paginationQuerySchema.extend({
  companyId: z.cuid().optional(),
  departmentId: z.cuid().optional(),
  teamId: z.cuid().optional(),
  ownerUserId: z.enum(['me']).optional(),
});

const createProcessProjectBase = z.object({
  name: z.string().min(1).max(255),
  companyId: z.cuid().optional(),
  departmentId: z.cuid().optional(),
  teamId: z.cuid().optional(),
  personal: z.literal(true).optional(),
});

const exactlyOneOrgScopeOrPersonalRefine = (
  data: z.infer<typeof createProcessProjectBase>
): boolean => {
  const org =
    [data.companyId, data.departmentId, data.teamId].filter((x) => x != null).length === 1;
  const personal = data.personal === true;
  return (org && !personal) || (!org && personal);
};

const exactlyOneOrgScopeOrPersonalRefineMessage = {
  message: 'Exactly one of companyId, departmentId, teamId or personal must be set',
} as const;

/** Body: Process anlegen (genau einer: companyId, departmentId, teamId oder personal). */
export const createProcessBodySchema = createProcessProjectBase.refine(
  exactlyOneOrgScopeOrPersonalRefine,
  exactlyOneOrgScopeOrPersonalRefineMessage
);

/** Body: Project anlegen (genau einer: companyId, departmentId, teamId oder personal). */
export const createProjectBodySchema = createProcessProjectBase.refine(
  exactlyOneOrgScopeOrPersonalRefine,
  exactlyOneOrgScopeOrPersonalRefineMessage
);

/** Body: Process/Project/Subcontext aktualisieren. */
export const updateProcessBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  deletedAt: z.iso.datetime().nullable().optional(),
  archivedAt: z.iso.datetime().nullable().optional(),
});

export const updateProjectBodySchema = updateProcessBodySchema;
export const updateSubcontextBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

/** Body: Subcontext anlegen. */
export const createSubcontextBodySchema = z.object({
  name: z.string().min(1).max(255),
});

/** Params. */
export const processIdParamSchema = z.object({ processId: z.cuid() });
export const projectIdParamSchema = z.object({ projectId: z.cuid() });
export const subcontextIdParamSchema = z.object({ subcontextId: z.cuid() });
