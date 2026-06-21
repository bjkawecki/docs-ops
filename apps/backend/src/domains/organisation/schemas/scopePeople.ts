import { z } from 'zod';

export const scopePersonRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  roles: z.array(z.enum(['member', 'lead'])).optional(),
  isOnline: z.boolean(),
  lastActiveAt: z.string().nullable(),
});

export const teamPeopleResponseSchema = z.object({
  items: z.array(scopePersonRowSchema),
  total: z.number().int().nonnegative(),
  onlineCount: z.number().int().nonnegative(),
});

export const departmentPeopleResponseSchema = z.object({
  departmentLeads: z.array(scopePersonRowSchema),
  teams: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      teamLeads: z.array(scopePersonRowSchema),
      members: z.array(scopePersonRowSchema),
    })
  ),
  summary: z.object({
    peopleCount: z.number().int().nonnegative(),
    onlineCount: z.number().int().nonnegative(),
    teamCount: z.number().int().nonnegative(),
  }),
});

export const companyPeopleResponseSchema = z.object({
  companyLeads: z.array(scopePersonRowSchema),
  departments: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      departmentLeads: z.array(scopePersonRowSchema),
      teams: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          peopleCount: z.number().int().nonnegative(),
          onlineCount: z.number().int().nonnegative(),
        })
      ),
      peopleCount: z.number().int().nonnegative(),
      onlineCount: z.number().int().nonnegative(),
      teamCount: z.number().int().nonnegative(),
    })
  ),
  summary: z.object({
    peopleCount: z.number().int().nonnegative(),
    onlineCount: z.number().int().nonnegative(),
    departmentCount: z.number().int().nonnegative(),
  }),
});

export type TeamPeopleResponse = z.infer<typeof teamPeopleResponseSchema>;
export type DepartmentPeopleResponse = z.infer<typeof departmentPeopleResponseSchema>;
export type CompanyPeopleResponse = z.infer<typeof companyPeopleResponseSchema>;
