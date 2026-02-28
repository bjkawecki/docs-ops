import { z } from 'zod';
import { paginationQuerySchema } from './organisation.js';

export { paginationQuerySchema };

/** Body: Process anlegen (genau einer: departmentId oder teamId). */
export const createProcessBodySchema = z
  .object({
    name: z.string().min(1).max(255),
    departmentId: z.cuid().optional(),
    teamId: z.cuid().optional(),
  })
  .refine((data) => (data.departmentId != null) !== (data.teamId != null), {
    message: 'Genau einer von departmentId oder teamId muss gesetzt sein',
  });

/** Body: Project anlegen. */
export const createProjectBodySchema = z
  .object({
    name: z.string().min(1).max(255),
    departmentId: z.cuid().optional(),
    teamId: z.cuid().optional(),
  })
  .refine((data) => (data.departmentId != null) !== (data.teamId != null), {
    message: 'Genau einer von departmentId oder teamId muss gesetzt sein',
  });

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
