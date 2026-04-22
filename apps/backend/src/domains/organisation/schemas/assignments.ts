import { z } from 'zod';

/** Query: Pagination für Zuordnungslisten (limit, offset). Default limit=100. */
export const assignmentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Params: teamId. */
export const teamIdParamSchema = z.object({
  teamId: z.cuid(),
});

/** Params: companyId. */
export const companyIdParamSchema = z.object({
  companyId: z.cuid(),
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

/** Params: companyId + userId (DELETE /companies/:companyId/company-leads/:userId). */
export const companyIdUserIdParamSchema = z.object({
  companyId: z.cuid(),
  userId: z.cuid(),
});

/** Params: departmentId + userId (DELETE /departments/:departmentId/department-leads/:userId). */
export const departmentIdUserIdParamSchema = z.object({
  departmentId: z.cuid(),
  userId: z.cuid(),
});

/** Body: User-Zuordnung (POST members, team-leads, department-leads). */
export const addAssignmentBodySchema = z.object({
  userId: z.cuid(),
});
