import { z } from 'zod';

/** Body: PATCH /me – eigenes Profil (nur Anzeigename). E-Mail über Account. */
export const patchMeBodySchema = z.object({
  name: z.string().min(1, 'Name erforderlich').max(200),
});

export type PatchMeBody = z.infer<typeof patchMeBodySchema>;

/** Body: PATCH /me/preferences – Theme, Sidebar-Pin, Locale, Zuletzt angesehene pro Scope. */
const recentItemSchema = z.object({
  type: z.enum(['process', 'project', 'document']),
  id: z.string().cuid(),
  name: z.string().max(255).optional(),
});

export const patchPreferencesBodySchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']).optional(),
  sidebarPinned: z.boolean().optional(),
  scopeRecentPanelOpen: z.boolean().optional(),
  locale: z.enum(['en', 'de']).optional(),
  primaryColor: z
    .enum([
      'blue',
      'green',
      'violet',
      'teal',
      'indigo',
      'amber',
      'sky',
      'rose',
      'orange',
      'fuchsia',
    ])
    .optional(),
  textSize: z.enum(['default', 'large', 'larger']).optional(),
  recentItemsByScope: z.record(z.string(), z.array(recentItemSchema).max(8)).optional(),
});

export type PatchPreferencesBody = z.infer<typeof patchPreferencesBodySchema>;

const MIN_PASSWORD_LENGTH = 8;

/** Body: PATCH /me/account – E-Mail und/oder Passwort (nur bei lokalem Login). */
export const patchAccountBodySchema = z.object({
  email: z.string().email('Invalid email address').nullable().optional(),
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`)
    .optional(),
});

export type PatchAccountBody = z.infer<typeof patchAccountBodySchema>;
export { MIN_PASSWORD_LENGTH };

/** Params: DELETE /me/sessions/:sessionId */
export const sessionIdParamSchema = z.object({
  sessionId: z.string().min(1, 'Session-ID erforderlich'),
});
export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;

/** Query: GET /me/drafts – scope filter (exactly one or none for all), optional limit/offset. */
const draftsScopeSchema = z
  .object({
    scope: z.enum(['personal', 'shared']).optional(),
    companyId: z.string().cuid().optional(),
    departmentId: z.string().cuid().optional(),
    teamId: z.string().cuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine(
    (q) => {
      const count = [q.scope, q.companyId, q.departmentId, q.teamId].filter(
        (x) => x != null
      ).length;
      return count <= 1;
    },
    { message: 'At most one of scope, companyId, departmentId, teamId' }
  );
export const meDraftsQuerySchema = draftsScopeSchema;
export type MeDraftsQuery = z.infer<typeof meDraftsQuerySchema>;

/** Query: GET /me/storage – scope (personal | team | department | company) and corresponding id. */
export const meStorageQuerySchema = z
  .object({
    scope: z.enum(['personal', 'team', 'department', 'company']).optional(),
    teamId: z.string().cuid().optional(),
    departmentId: z.string().cuid().optional(),
    companyId: z.string().cuid().optional(),
  })
  .refine(
    (q) => {
      if (!q.scope || q.scope === 'personal') return true;
      if (q.scope === 'team') return q.teamId != null;
      if (q.scope === 'department') return q.departmentId != null;
      if (q.scope === 'company') return q.companyId != null;
      return true;
    },
    { message: 'teamId/departmentId/companyId required when scope is team/department/company' }
  );
export type MeStorageQuery = z.infer<typeof meStorageQuerySchema>;

/** Query: GET /me/trash – scope, type filter, sort, pagination. */
export const meTrashQuerySchema = z
  .object({
    scope: z.enum(['personal', 'company', 'department', 'team']),
    companyId: z.string().cuid().optional(),
    departmentId: z.string().cuid().optional(),
    teamId: z.string().cuid().optional(),
    type: z.enum(['document', 'process', 'project']).optional(),
    sortBy: z.enum(['deletedAt', 'title']).default('deletedAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine(
    (q) => {
      if (q.scope === 'company') return q.companyId != null;
      if (q.scope === 'department') return q.departmentId != null;
      if (q.scope === 'team') return q.teamId != null;
      return true;
    },
    { message: 'companyId/departmentId/teamId required for scope company/department/team' }
  );
export type MeTrashQuery = z.infer<typeof meTrashQuerySchema>;

/** Query: GET /me/archive – same as trash, sortBy uses archivedAt. */
export const meArchiveQuerySchema = meTrashQuerySchema.safeExtend({
  sortBy: z.enum(['archivedAt', 'title']).default('archivedAt'),
});
export type MeArchiveQuery = z.infer<typeof meArchiveQuerySchema>;

/** Query: GET /me/can-write-in-scope – scope and scope id (company, department, or team). */
export const meCanWriteInScopeQuerySchema = z
  .object({
    scope: z.enum(['company', 'department', 'team']),
    companyId: z.string().cuid().optional(),
    departmentId: z.string().cuid().optional(),
    teamId: z.string().cuid().optional(),
  })
  .refine(
    (q) => {
      if (q.scope === 'company') return q.companyId != null;
      if (q.scope === 'department') return q.departmentId != null;
      if (q.scope === 'team') return q.teamId != null;
      return true;
    },
    { message: 'companyId/departmentId/teamId required for scope company/department/team' }
  );
export type MeCanWriteInScopeQuery = z.infer<typeof meCanWriteInScopeQuerySchema>;

/** Response: GET /me/can-write-in-scope. */
export const meCanWriteInScopeResponseSchema = z.object({
  canWrite: z.boolean(),
});
export type MeCanWriteInScopeResponse = z.infer<typeof meCanWriteInScopeResponseSchema>;

/** Unified trash/archive item for table (type, displayTitle, date). Used by GET /me/trash and GET /me/archive. */
export type MeTrashArchiveItem = {
  type: 'document' | 'process' | 'project';
  id: string;
  displayTitle: string;
  contextName: string;
  deletedAt?: string;
  archivedAt?: string;
};
