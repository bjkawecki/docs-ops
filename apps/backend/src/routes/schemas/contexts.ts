import { z } from 'zod';
import { paginationQuerySchema, type PaginationQuery } from './organisation.js';

export { paginationQuerySchema };
export type { PaginationQuery };

/** Query: Liste Prozesse (Pagination + optional nach Company filtern). */
export const processListQuerySchema = paginationQuerySchema.extend({
  companyId: z.string().cuid().optional(),
});

/** Query: Liste Projekte (Pagination + optional nach Company filtern). */
export const projectListQuerySchema = paginationQuerySchema.extend({
  companyId: z.string().cuid().optional(),
});

/** Body: Process anlegen (genau einer: companyId, departmentId oder teamId). */
export const createProcessBodySchema = z
  .object({
    name: z.string().min(1).max(255),
    companyId: z.cuid().optional(),
    departmentId: z.cuid().optional(),
    teamId: z.cuid().optional(),
  })
  .refine(
    (data) =>
      [data.companyId, data.departmentId, data.teamId].filter((x) => x != null).length === 1,
    { message: 'Genau einer von companyId, departmentId oder teamId muss gesetzt sein' }
  );

/** Body: Project anlegen (genau einer: companyId, departmentId oder teamId). */
export const createProjectBodySchema = z
  .object({
    name: z.string().min(1).max(255),
    companyId: z.cuid().optional(),
    departmentId: z.cuid().optional(),
    teamId: z.cuid().optional(),
  })
  .refine(
    (data) =>
      [data.companyId, data.departmentId, data.teamId].filter((x) => x != null).length === 1,
    { message: 'Genau einer von companyId, departmentId oder teamId muss gesetzt sein' }
  );

/** Body: Process/Project/Subcontext/UserSpace aktualisieren. */
export const updateProcessBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  deletedAt: z.string().datetime().nullable().optional(),
});

export const updateProjectBodySchema = updateProcessBodySchema;
export const updateSubcontextBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
});
export const updateUserSpaceBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

/** Body: Subcontext anlegen. */
export const createSubcontextBodySchema = z.object({
  name: z.string().min(1).max(255),
});

/** Body: UserSpace anlegen. */
export const createUserSpaceBodySchema = z.object({
  name: z.string().min(1).max(255),
});

/** Params. */
export const processIdParamSchema = z.object({ processId: z.cuid() });
export const projectIdParamSchema = z.object({ projectId: z.cuid() });
export const subcontextIdParamSchema = z.object({ subcontextId: z.cuid() });
export const userSpaceIdParamSchema = z.object({ userSpaceId: z.cuid() });
