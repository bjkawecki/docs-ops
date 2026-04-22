import { z } from 'zod';

/** Query: Pagination (limit, offset). */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Body: Company anlegen. */
export const createCompanyBodySchema = z.object({
  name: z.string().min(1).max(255),
});

/** Body: Company aktualisieren. */
export const updateCompanyBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

/** Body: Department anlegen. */
export const createDepartmentBodySchema = z.object({
  name: z.string().min(1).max(255),
});

/** Body: Department aktualisieren. */
export const updateDepartmentBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

/** Body: Team anlegen. */
export const createTeamBodySchema = z.object({
  name: z.string().min(1).max(255),
});

/** Body: Team aktualisieren (Name und/oder Abteilung wechseln). */
export const updateTeamBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  departmentId: z.string().cuid().optional(),
});

/** Params: companyId. */
export const companyIdParamSchema = z.object({
  companyId: z.cuid(),
});

/** Params: departmentId. */
export const departmentIdParamSchema = z.object({
  departmentId: z.cuid(),
});

/** Params: teamId. */
export const teamIdParamSchema = z.object({
  teamId: z.cuid(),
});
