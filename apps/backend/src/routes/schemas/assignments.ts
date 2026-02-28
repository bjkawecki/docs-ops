import { z } from 'zod';

/** Query: Pagination für Zuordnungslisten (limit, offset). Default limit=100. */
export const assignmentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AssignmentListQuery = z.infer<typeof assignmentListQuerySchema>;

/** Params: teamId. */
export const teamIdParamSchema = z.object({
  teamId: z.cuid(),
});

/** Params: departmentId. */
export const departmentIdParamSchema = z.object({
  departmentId: z.cuid(),
});

/** Params: teamId + userId (z. B. DELETE /teams/:teamId/members/:userId). */
export const teamIdUserIdParamSchema = z.object({
  teamId: z.cuid(),
  userId: z.cuid(),
});

/** Params: departmentId + userId (DELETE /departments/:departmentId/supervisors/:userId). */
export const departmentIdUserIdParamSchema = z.object({
  departmentId: z.cuid(),
  userId: z.cuid(),
});

/** Body: User-Zuordnung (POST members, leaders, supervisors). */
export const addAssignmentBodySchema = z.object({
  userId: z.cuid(),
});

export type AddAssignmentBody = z.infer<typeof addAssignmentBodySchema>;
