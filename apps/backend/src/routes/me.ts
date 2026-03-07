import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  SESSION_COOKIE_NAME,
  type RequestWithUser,
} from '../auth/middleware.js';
import type { RequestUser } from '../auth/types.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  patchMeBodySchema,
  patchPreferencesBodySchema,
  patchAccountBodySchema,
  sessionIdParamSchema,
  meDraftsQuerySchema,
  meStorageQuerySchema,
  meTrashQuerySchema,
  meArchiveQuerySchema,
  meCanWriteInScopeQuerySchema,
  type MeDraftsQuery,
} from './schemas/me.js';
import { canPinForScope } from '../permissions/pinnedPermissions.js';
import { canViewCompany, canViewDepartment } from '../permissions/assignmentPermissions.js';
import { paginationQuerySchema, type PaginationQuery } from './schemas/organisation.js';
import {
  getReadableCatalogScope,
  getWritableCatalogScope,
} from '../permissions/catalogPermissions.js';
import { setOwnerDisplayName, refreshContextOwnerDisplayForOwner } from '../contextOwnerDisplay.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

/** Ein Eintrag in „Zuletzt angesehene“ (process/project/document). */
export type RecentPreferencesItem = {
  type: 'process' | 'project' | 'document';
  id: string;
  name?: string;
};

/** User-Preferences: theme, sidebarPinned, scopeRecentPanelOpen, locale, primaryColor, recentItemsByScope. Defaults in App, nicht in DB. */
export type UserPreferences = {
  theme?: 'light' | 'dark' | 'auto';
  sidebarPinned?: boolean;
  scopeRecentPanelOpen?: boolean;
  locale?: 'en' | 'de';
  primaryColor?:
    | 'blue'
    | 'green'
    | 'violet'
    | 'teal'
    | 'indigo'
    | 'amber'
    | 'sky'
    | 'rose'
    | 'orange'
    | 'fuchsia';
  /** Pro Scope (company/department/team) eine Liste; Key z. B. "company:cid", "department:did", "team:tid". */
  recentItemsByScope?: Record<string, RecentPreferencesItem[]>;
};

/** Scope for GET /me/drafts: context IDs and grant-based document IDs in that scope. */
async function getDraftsScope(
  prisma: PrismaClient,
  userId: string,
  query: MeDraftsQuery
): Promise<{ scopeContextIds: string[]; scopeDocumentIds: string[] }> {
  if (!query.scope && !query.companyId && !query.departmentId && !query.teamId) {
    const readable = await getReadableCatalogScope(prisma, userId);
    return {
      scopeContextIds: readable.contextIds,
      scopeDocumentIds: readable.documentIdsFromGrants,
    };
  }
  if (query.scope === 'personal') {
    const [processContexts, projectContexts, subcontextContexts] = await Promise.all([
      prisma.process.findMany({
        where: { deletedAt: null, owner: { ownerUserId: userId } },
        select: { contextId: true },
      }),
      prisma.project.findMany({
        where: { deletedAt: null, owner: { ownerUserId: userId } },
        select: { contextId: true },
      }),
      prisma.subcontext.findMany({
        where: { project: { owner: { ownerUserId: userId } } },
        select: { contextId: true },
      }),
    ]);
    const scopeContextIds = [
      ...processContexts.map((p) => p.contextId),
      ...projectContexts.map((p) => p.contextId),
      ...subcontextContexts.map((s) => s.contextId),
    ];
    return { scopeContextIds, scopeDocumentIds: [] };
  }
  if (query.scope === 'shared') {
    const [userGrantDocIds, teamGrantDocIds, deptGrantDocIds] = await Promise.all([
      prisma.documentGrantUser
        .findMany({ where: { userId }, select: { documentId: true } })
        .then((rows) => rows.map((r) => r.documentId)),
      prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } }).then((teamIds) =>
        prisma.documentGrantTeam
          .findMany({
            where: { teamId: { in: teamIds.map((t) => t.teamId) } },
            select: { documentId: true },
          })
          .then((rows) => rows.map((r) => r.documentId))
      ),
      prisma.teamMember
        .findMany({
          where: { userId },
          include: { team: { select: { departmentId: true } } },
        })
        .then((members) => [...new Set(members.map((m) => m.team.departmentId))])
        .then((departmentIds) =>
          departmentIds.length === 0
            ? Promise.resolve([] as string[])
            : prisma.documentGrantDepartment
                .findMany({
                  where: { departmentId: { in: departmentIds } },
                  select: { documentId: true },
                })
                .then((rows) => rows.map((r) => r.documentId))
        ),
    ]);
    const scopeDocumentIds = [
      ...new Set([...userGrantDocIds, ...teamGrantDocIds, ...deptGrantDocIds]),
    ];
    return { scopeContextIds: [], scopeDocumentIds };
  }
  const ownerFilter =
    query.companyId != null
      ? { companyId: query.companyId }
      : query.departmentId != null
        ? { departmentId: query.departmentId }
        : { teamId: query.teamId! };
  const [processContexts, projectContexts, subcontextContexts] = await Promise.all([
    prisma.process.findMany({
      where: { deletedAt: null, owner: ownerFilter },
      select: { contextId: true },
    }),
    prisma.project.findMany({
      where: { deletedAt: null, owner: ownerFilter },
      select: { contextId: true },
    }),
    prisma.subcontext.findMany({
      where: { project: { owner: ownerFilter } },
      select: { contextId: true },
    }),
  ]);
  const scopeContextIds = [
    ...processContexts.map((p) => p.contextId),
    ...projectContexts.map((p) => p.contextId),
    ...subcontextContexts.map((s) => s.contextId),
  ];
  return { scopeContextIds, scopeDocumentIds: [] };
}

/** All context IDs belonging to a company (process + project + subcontext). */
async function getCompanyContextIds(prisma: PrismaClient, companyId: string): Promise<string[]> {
  const [processContexts, projectContexts] = await Promise.all([
    prisma.process.findMany({
      where: { owner: { companyId } },
      select: { contextId: true },
    }),
    prisma.project.findMany({
      where: { owner: { companyId } },
      select: { contextId: true },
      include: { subcontexts: { select: { contextId: true } } },
    }),
  ]);
  return [
    ...processContexts.map((p) => p.contextId),
    ...projectContexts.flatMap((p) => [p.contextId, ...p.subcontexts.map((s) => s.contextId)]),
  ];
}

/** All context IDs belonging to a department (process + project + subcontext). */
async function getDepartmentContextIds(
  prisma: PrismaClient,
  departmentId: string
): Promise<string[]> {
  const [processContexts, projectContexts] = await Promise.all([
    prisma.process.findMany({
      where: { owner: { departmentId } },
      select: { contextId: true },
    }),
    prisma.project.findMany({
      where: { owner: { departmentId } },
      select: { contextId: true },
      include: { subcontexts: { select: { contextId: true } } },
    }),
  ]);
  return [
    ...processContexts.map((p) => p.contextId),
    ...projectContexts.flatMap((p) => [p.contextId, ...p.subcontexts.map((s) => s.contextId)]),
  ];
}

/** All context IDs belonging to a team (process + project + subcontext). */
async function getTeamContextIds(prisma: PrismaClient, teamId: string): Promise<string[]> {
  const [processContexts, projectContexts] = await Promise.all([
    prisma.process.findMany({
      where: { owner: { teamId } },
      select: { contextId: true },
    }),
    prisma.project.findMany({
      where: { owner: { teamId } },
      select: { contextId: true },
      include: { subcontexts: { select: { contextId: true } } },
    }),
  ]);
  return [
    ...processContexts.map((p) => p.contextId),
    ...projectContexts.flatMap((p) => [p.contextId, ...p.subcontexts.map((s) => s.contextId)]),
  ];
}

/** Unified trash/archive item for table (type, displayTitle, date). */
export type MeTrashArchiveItem = {
  type: 'document' | 'process' | 'project';
  id: string;
  displayTitle: string;
  contextName: string;
  deletedAt?: string;
  archivedAt?: string;
};

function contextNameFromDoc(doc: {
  context?: {
    process: { name: string } | null;
    project: { name: string } | null;
    subcontext: { name: string } | null;
  } | null;
}): string {
  if (!doc.context) return 'No context';
  if (doc.context.process) return doc.context.process.name;
  if (doc.context.project) return doc.context.project.name;
  if (doc.context.subcontext) return doc.context.subcontext.name;
  return 'No context';
}

/** Ein Team-Eintrag in der Identity (mit Rolle). */
export type MeIdentityTeam = {
  teamId: string;
  teamName: string;
  departmentName: string;
  departmentId: string;
  role: 'member' | 'leader';
};

/** Response GET /me. Bei aktiver Impersonation wird impersonation mitgesendet. */
export type MeResponse = {
  user: {
    id: string;
    name: string;
    email: string | null;
    isAdmin: boolean;
    hasLocalLogin: boolean;
  };
  identity: {
    teams: MeIdentityTeam[];
    departments: { id: string; name: string }[];
    departmentLeads: { id: string; name: string }[];
    companyLeads: { id: string; name: string }[];
  };
  preferences: UserPreferences;
  /** Nur gesetzt, wenn Admin gerade als anderer Nutzer agiert. */
  impersonation?: { active: true; realUser: { id: string; name: string } };
};

const meRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  /** GET /api/v1/me – erweiterte Nutzerdaten inkl. Identity und Preferences (effektiver User bei Impersonation). */
  app.get('/me', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = getEffectiveUserId(request as RequestWithUser);

    const user = await request.server.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        isAdmin: true,
        passwordHash: true,
        preferences: true,
        teamMemberships: {
          include: {
            team: { include: { department: true } },
          },
        },
        leadOfTeams: {
          include: {
            team: { include: { department: true } },
          },
        },
        departmentLeads: {
          include: { department: true },
        },
        companyLeads: {
          include: { company: true },
        },
      },
    });

    const leaderTeamIds = new Set(user.leadOfTeams.map((l) => l.teamId));
    const teams: MeIdentityTeam[] = [];
    const departmentMap = new Map<string, { id: string; name: string }>();

    for (const m of user.teamMemberships) {
      const role = leaderTeamIds.has(m.teamId) ? ('leader' as const) : ('member' as const);
      teams.push({
        teamId: m.team.id,
        teamName: m.team.name,
        departmentId: m.team.department.id,
        departmentName: m.team.department.name,
        role,
      });
      departmentMap.set(m.team.department.id, {
        id: m.team.department.id,
        name: m.team.department.name,
      });
    }

    const departmentLeads = user.departmentLeads.map((d) => ({
      id: d.department.id,
      name: d.department.name,
    }));
    for (const d of departmentLeads) {
      departmentMap.set(d.id, { id: d.id, name: d.name });
    }

    const companyLeads = user.companyLeads.map((c) => ({
      id: c.company.id,
      name: c.company.name,
    }));

    const preferences: UserPreferences =
      user.preferences != null && typeof user.preferences === 'object'
        ? (user.preferences as UserPreferences)
        : {};

    const req = request as { user: RequestUser; effectiveUserId?: string };
    const response: MeResponse = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        hasLocalLogin: user.passwordHash != null,
      },
      identity: {
        teams,
        departments: Array.from(departmentMap.values()),
        departmentLeads,
        companyLeads,
      },
      preferences,
      ...(req.effectiveUserId
        ? {
            impersonation: {
              active: true as const,
              realUser: { id: req.user.id, name: req.user.name },
            },
          }
        : {}),
    };
    return reply.send(response);
  });

  /** GET /api/v1/me/personal-documents – Documents in the user's personal processes/projects (paginated). */
  app.get(
    '/me/personal-documents',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const query: PaginationQuery = paginationQuerySchema.parse(request.query);

      const [processContexts, projectContexts, subcontextContexts] = await Promise.all([
        prisma.process.findMany({
          where: { deletedAt: null, owner: { ownerUserId: userId } },
          select: { contextId: true },
        }),
        prisma.project.findMany({
          where: { deletedAt: null, owner: { ownerUserId: userId } },
          select: { contextId: true },
        }),
        prisma.subcontext.findMany({
          where: { project: { owner: { ownerUserId: userId } } },
          select: { contextId: true },
        }),
      ]);
      const personalContextIds = [
        ...processContexts.map((p) => p.contextId),
        ...projectContexts.map((p) => p.contextId),
        ...subcontextContexts.map((s) => s.contextId),
      ];

      if (personalContextIds.length === 0) {
        return reply.send({
          items: [],
          total: 0,
          limit: query.limit,
          offset: query.offset,
        });
      }

      const [items, total] = await Promise.all([
        prisma.document.findMany({
          where: {
            contextId: { in: personalContextIds },
            deletedAt: null,
            archivedAt: null,
          },
          select: {
            id: true,
            title: true,
            contextId: true,
            createdAt: true,
            updatedAt: true,
            documentTags: { include: { tag: { select: { id: true, name: true } } } },
          },
          take: query.limit,
          skip: query.offset,
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.document.count({
          where: {
            contextId: { in: personalContextIds },
            deletedAt: null,
            archivedAt: null,
          },
        }),
      ]);
      return reply.send({ items, total, limit: query.limit, offset: query.offset });
    }
  );

  /** GET /api/v1/me/trash – Soft-deleted documents and contexts (unified items, filter/sort/paginate). §4b: Company = lead or writable; else empty list. */
  app.get('/me/trash', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = meTrashQuerySchema.parse(request.query);

    const contextInclude = {
      context: {
        include: {
          process: { select: { name: true } },
          project: { select: { name: true } },
          subcontext: { select: { name: true } },
        },
      },
    };

    const allItems: MeTrashArchiveItem[] = [];

    if (query.scope === 'personal') {
      const [trashedDocs, trashedProcesses, trashedProjects] = await Promise.all([
        prisma.document.findMany({
          where: {
            deletedAt: { not: null },
            OR: [
              { context: { process: { owner: { ownerUserId: userId } } } },
              { context: { project: { owner: { ownerUserId: userId } } } },
              { context: { subcontext: { project: { owner: { ownerUserId: userId } } } } },
              { contextId: null, createdById: userId },
            ],
          },
          select: {
            id: true,
            title: true,
            deletedAt: true,
            ...contextInclude,
          },
        }),
        prisma.process.findMany({
          where: { deletedAt: { not: null }, owner: { ownerUserId: userId } },
          select: { id: true, name: true, deletedAt: true },
        }),
        prisma.project.findMany({
          where: { deletedAt: { not: null }, owner: { ownerUserId: userId } },
          select: { id: true, name: true, deletedAt: true },
        }),
      ]);
      for (const d of trashedDocs) {
        allItems.push({
          type: 'document',
          id: d.id,
          displayTitle: d.title,
          contextName: contextNameFromDoc(d),
          deletedAt: d.deletedAt?.toISOString() ?? '',
        });
      }
      for (const p of trashedProcesses) {
        allItems.push({
          type: 'process',
          id: p.id,
          displayTitle: p.name,
          contextName: '-',
          deletedAt: p.deletedAt?.toISOString() ?? '',
        });
      }
      for (const p of trashedProjects) {
        allItems.push({
          type: 'project',
          id: p.id,
          displayTitle: p.name,
          contextName: '-',
          deletedAt: p.deletedAt?.toISOString() ?? '',
        });
      }
    } else if (query.scope === 'company') {
      const companyId = query.companyId!;
      const [writable, companyLead, trashedProcs, trashedProjs, allCompanyContextIdsRows] =
        await Promise.all([
          getWritableCatalogScope(prisma, userId),
          canViewCompany(prisma, userId, companyId),
          prisma.process.findMany({
            where: { deletedAt: { not: null }, owner: { companyId } },
            select: { id: true, name: true, contextId: true, deletedAt: true },
          }),
          prisma.project.findMany({
            where: { deletedAt: { not: null }, owner: { companyId } },
            select: { id: true, name: true, contextId: true, deletedAt: true },
          }),
          Promise.all([
            prisma.process.findMany({
              where: { owner: { companyId } },
              select: { contextId: true },
            }),
            prisma.project.findMany({
              where: { owner: { companyId } },
              select: { contextId: true },
              include: { subcontexts: { select: { contextId: true } } },
            }),
          ]),
        ]);
      const companyContextIds = [
        ...allCompanyContextIdsRows[0].map((p) => p.contextId),
        ...allCompanyContextIdsRows[1].flatMap((p) => [
          p.contextId,
          ...p.subcontexts.map((s) => s.contextId),
        ]),
      ];
      const writableCtxSet = new Set(writable.contextIds);
      const writableDocSet = new Set(writable.documentIdsFromGrants);

      const hasContextAccess =
        trashedProcs.some((p) => writableCtxSet.has(p.contextId)) ||
        trashedProjs.some((p) => writableCtxSet.has(p.contextId));
      const trashedDocIds =
        companyContextIds.length > 0
          ? await prisma.document
              .findMany({
                where: { deletedAt: { not: null }, contextId: { in: companyContextIds } },
                select: { id: true },
              })
              .then((r) => r.map((d) => d.id))
          : [];
      const hasDocAccess = companyLead || trashedDocIds.some((id) => writableDocSet.has(id));
      if (!companyLead && !hasContextAccess && !hasDocAccess) {
        return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
      }

      for (const p of trashedProcs) {
        if (companyLead || writableCtxSet.has(p.contextId)) {
          allItems.push({
            type: 'process',
            id: p.id,
            displayTitle: p.name,
            contextName: '-',
            deletedAt: p.deletedAt?.toISOString() ?? '',
          });
        }
      }
      for (const p of trashedProjs) {
        if (companyLead || writableCtxSet.has(p.contextId)) {
          allItems.push({
            type: 'project',
            id: p.id,
            displayTitle: p.name,
            contextName: '-',
            deletedAt: p.deletedAt?.toISOString() ?? '',
          });
        }
      }
      const writableDocIds = [...writableDocSet];
      const trashedDocs = await prisma.document.findMany({
        where: {
          deletedAt: { not: null },
          ...(companyLead
            ? companyContextIds.length > 0
              ? { contextId: { in: companyContextIds } }
              : { id: { in: [] } }
            : {
                OR: [
                  ...(companyContextIds.length > 0
                    ? [{ contextId: { in: companyContextIds } }]
                    : []),
                  ...(writableDocIds.length > 0 ? [{ id: { in: writableDocIds } }] : []),
                ].filter(Boolean),
              }),
        },
        select: { id: true, title: true, contextId: true, deletedAt: true, ...contextInclude },
      });
      for (const d of trashedDocs) {
        allItems.push({
          type: 'document',
          id: d.id,
          displayTitle: d.title,
          contextName: contextNameFromDoc(d),
          deletedAt: d.deletedAt?.toISOString() ?? '',
        });
      }
    } else if (query.scope === 'department' && query.departmentId != null) {
      const departmentId = query.departmentId;
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
        select: { companyId: true },
      });
      if (!department) {
        return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
      }
      const [
        writable,
        scopeLeadDept,
        scopeLeadCompany,
        trashedProcs,
        trashedProjs,
        scopeContextIds,
      ] = await Promise.all([
        getWritableCatalogScope(prisma, userId),
        canViewDepartment(prisma, userId, departmentId),
        canViewCompany(prisma, userId, department.companyId ?? ''),
        prisma.process.findMany({
          where: { deletedAt: { not: null }, owner: { departmentId } },
          select: { id: true, name: true, contextId: true, deletedAt: true },
        }),
        prisma.project.findMany({
          where: { deletedAt: { not: null }, owner: { departmentId } },
          select: { id: true, name: true, contextId: true, deletedAt: true },
        }),
        getDepartmentContextIds(prisma, departmentId),
      ]);
      const scopeLead = scopeLeadDept || (department.companyId != null && scopeLeadCompany);
      const writableCtxSet = new Set(writable.contextIds);
      const writableDocSet = new Set(writable.documentIdsFromGrants);
      const hasContextAccess =
        trashedProcs.some((p) => writableCtxSet.has(p.contextId)) ||
        trashedProjs.some((p) => writableCtxSet.has(p.contextId));
      const trashedDocIds =
        scopeContextIds.length > 0
          ? await prisma.document
              .findMany({
                where: { deletedAt: { not: null }, contextId: { in: scopeContextIds } },
                select: { id: true },
              })
              .then((r) => r.map((d) => d.id))
          : [];
      const hasDocAccess = scopeLead || trashedDocIds.some((id) => writableDocSet.has(id));
      if (!scopeLead && !hasContextAccess && !hasDocAccess) {
        return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
      }
      for (const p of trashedProcs) {
        if (scopeLead || writableCtxSet.has(p.contextId)) {
          allItems.push({
            type: 'process',
            id: p.id,
            displayTitle: p.name,
            contextName: '-',
            deletedAt: p.deletedAt?.toISOString() ?? '',
          });
        }
      }
      for (const p of trashedProjs) {
        if (scopeLead || writableCtxSet.has(p.contextId)) {
          allItems.push({
            type: 'project',
            id: p.id,
            displayTitle: p.name,
            contextName: '-',
            deletedAt: p.deletedAt?.toISOString() ?? '',
          });
        }
      }
      const writableDocIds = [...writableDocSet];
      const trashedDocs = await prisma.document.findMany({
        where: {
          deletedAt: { not: null },
          ...(scopeLead
            ? scopeContextIds.length > 0
              ? { contextId: { in: scopeContextIds } }
              : { id: { in: [] } }
            : {
                OR: [
                  ...(scopeContextIds.length > 0 ? [{ contextId: { in: scopeContextIds } }] : []),
                  ...(writableDocIds.length > 0 ? [{ id: { in: writableDocIds } }] : []),
                ].filter(Boolean),
              }),
        },
        select: { id: true, title: true, contextId: true, deletedAt: true, ...contextInclude },
      });
      for (const d of trashedDocs) {
        allItems.push({
          type: 'document',
          id: d.id,
          displayTitle: d.title,
          contextName: contextNameFromDoc(d),
          deletedAt: d.deletedAt?.toISOString() ?? '',
        });
      }
    } else if (query.scope === 'team' && query.teamId != null) {
      const teamId = query.teamId;
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { departmentId: true, department: { select: { companyId: true } } },
      });
      if (!team) {
        return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
      }
      const companyId = team.department?.companyId ?? null;
      const [
        writable,
        scopeLeadDept,
        scopeLeadCompany,
        isTeamLead,
        trashedProcs,
        trashedProjs,
        scopeContextIds,
      ] = await Promise.all([
        getWritableCatalogScope(prisma, userId),
        team.departmentId != null
          ? canViewDepartment(prisma, userId, team.departmentId)
          : Promise.resolve(false),
        companyId != null ? canViewCompany(prisma, userId, companyId) : Promise.resolve(false),
        prisma.teamLead
          .findUnique({
            where: { teamId_userId: { teamId, userId } },
            select: { userId: true },
          })
          .then((r) => r != null),
        prisma.process.findMany({
          where: { deletedAt: { not: null }, owner: { teamId } },
          select: { id: true, name: true, contextId: true, deletedAt: true },
        }),
        prisma.project.findMany({
          where: { deletedAt: { not: null }, owner: { teamId } },
          select: { id: true, name: true, contextId: true, deletedAt: true },
        }),
        getTeamContextIds(prisma, teamId),
      ]);
      const scopeLead = scopeLeadDept || scopeLeadCompany || isTeamLead;
      const writableCtxSet = new Set(writable.contextIds);
      const writableDocSet = new Set(writable.documentIdsFromGrants);
      const hasContextAccess =
        trashedProcs.some((p) => writableCtxSet.has(p.contextId)) ||
        trashedProjs.some((p) => writableCtxSet.has(p.contextId));
      const trashedDocIds =
        scopeContextIds.length > 0
          ? await prisma.document
              .findMany({
                where: { deletedAt: { not: null }, contextId: { in: scopeContextIds } },
                select: { id: true },
              })
              .then((r) => r.map((d) => d.id))
          : [];
      const hasDocAccess = scopeLead || trashedDocIds.some((id) => writableDocSet.has(id));
      if (!scopeLead && !hasContextAccess && !hasDocAccess) {
        return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
      }
      for (const p of trashedProcs) {
        if (scopeLead || writableCtxSet.has(p.contextId)) {
          allItems.push({
            type: 'process',
            id: p.id,
            displayTitle: p.name,
            contextName: '-',
            deletedAt: p.deletedAt?.toISOString() ?? '',
          });
        }
      }
      for (const p of trashedProjs) {
        if (scopeLead || writableCtxSet.has(p.contextId)) {
          allItems.push({
            type: 'project',
            id: p.id,
            displayTitle: p.name,
            contextName: '-',
            deletedAt: p.deletedAt?.toISOString() ?? '',
          });
        }
      }
      const writableDocIds = [...writableDocSet];
      const trashedDocs = await prisma.document.findMany({
        where: {
          deletedAt: { not: null },
          ...(scopeLead
            ? scopeContextIds.length > 0
              ? { contextId: { in: scopeContextIds } }
              : { id: { in: [] } }
            : {
                OR: [
                  ...(scopeContextIds.length > 0 ? [{ contextId: { in: scopeContextIds } }] : []),
                  ...(writableDocIds.length > 0 ? [{ id: { in: writableDocIds } }] : []),
                ].filter(Boolean),
              }),
        },
        select: { id: true, title: true, contextId: true, deletedAt: true, ...contextInclude },
      });
      for (const d of trashedDocs) {
        allItems.push({
          type: 'document',
          id: d.id,
          displayTitle: d.title,
          contextName: contextNameFromDoc(d),
          deletedAt: d.deletedAt?.toISOString() ?? '',
        });
      }
    }

    const sortKey = query.sortBy === 'title' ? 'displayTitle' : 'deletedAt';
    const sortVal = (a: MeTrashArchiveItem) =>
      sortKey === 'displayTitle' ? (a.displayTitle ?? '').toLowerCase() : (a.deletedAt ?? '');
    allItems.sort((a, b) => {
      const va = sortVal(a);
      const vb = sortVal(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return query.sortOrder === 'asc' ? cmp : -cmp;
    });
    const filtered = query.type != null ? allItems.filter((i) => i.type === query.type) : allItems;
    const total = filtered.length;
    const items = filtered.slice(query.offset, query.offset + query.limit);
    return reply.send({ items, total, limit: query.limit, offset: query.offset });
  });

  /** GET /api/v1/me/archive – Archived documents and contexts (unified items). §4b: Company = lead or writable; else empty list. */
  app.get('/me/archive', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = meArchiveQuerySchema.parse(request.query);

    const archiveContextInclude = {
      context: {
        include: {
          process: { select: { name: true } },
          project: { select: { name: true } },
          subcontext: { select: { name: true } },
        },
      },
    };

    const allItems: MeTrashArchiveItem[] = [];

    if (query.scope === 'personal') {
      const [archivedDocs, archivedProcesses, archivedProjects] = await Promise.all([
        prisma.document.findMany({
          where: {
            deletedAt: null,
            archivedAt: { not: null },
            OR: [
              { context: { process: { owner: { ownerUserId: userId } } } },
              { context: { project: { owner: { ownerUserId: userId } } } },
              { context: { subcontext: { project: { owner: { ownerUserId: userId } } } } },
              { contextId: null, createdById: userId },
            ],
          },
          select: { id: true, title: true, archivedAt: true, ...archiveContextInclude },
        }),
        prisma.process.findMany({
          where: { archivedAt: { not: null }, owner: { ownerUserId: userId } },
          select: { id: true, name: true, archivedAt: true },
        }),
        prisma.project.findMany({
          where: { archivedAt: { not: null }, owner: { ownerUserId: userId } },
          select: { id: true, name: true, archivedAt: true },
        }),
      ]);
      for (const d of archivedDocs) {
        allItems.push({
          type: 'document',
          id: d.id,
          displayTitle: d.title,
          contextName: contextNameFromDoc(d),
          archivedAt: d.archivedAt?.toISOString() ?? '',
        });
      }
      for (const p of archivedProcesses) {
        allItems.push({
          type: 'process',
          id: p.id,
          displayTitle: p.name,
          contextName: '-',
          archivedAt: p.archivedAt?.toISOString() ?? '',
        });
      }
      for (const p of archivedProjects) {
        allItems.push({
          type: 'project',
          id: p.id,
          displayTitle: p.name,
          contextName: '-',
          archivedAt: p.archivedAt?.toISOString() ?? '',
        });
      }
    } else if (query.scope === 'company') {
      const companyId = query.companyId!;
      const [writable, companyLead, archivedProcs, archivedProjs, allCompanyContextIdsRows] =
        await Promise.all([
          getWritableCatalogScope(prisma, userId),
          canViewCompany(prisma, userId, companyId),
          prisma.process.findMany({
            where: { archivedAt: { not: null }, deletedAt: null, owner: { companyId } },
            select: { id: true, name: true, contextId: true, archivedAt: true },
          }),
          prisma.project.findMany({
            where: { archivedAt: { not: null }, deletedAt: null, owner: { companyId } },
            select: { id: true, name: true, contextId: true, archivedAt: true },
          }),
          Promise.all([
            prisma.process.findMany({
              where: { owner: { companyId } },
              select: { contextId: true },
            }),
            prisma.project.findMany({
              where: { owner: { companyId } },
              select: { contextId: true },
              include: { subcontexts: { select: { contextId: true } } },
            }),
          ]),
        ]);
      const companyContextIds = [
        ...allCompanyContextIdsRows[0].map((p) => p.contextId),
        ...allCompanyContextIdsRows[1].flatMap((p) => [
          p.contextId,
          ...p.subcontexts.map((s) => s.contextId),
        ]),
      ];
      const writableCtxSet = new Set(writable.contextIds);
      const writableDocSet = new Set(writable.documentIdsFromGrants);

      const hasContextAccess =
        archivedProcs.some((p) => writableCtxSet.has(p.contextId)) ||
        archivedProjs.some((p) => writableCtxSet.has(p.contextId));
      const archivedDocIds =
        companyContextIds.length > 0
          ? await prisma.document
              .findMany({
                where: {
                  deletedAt: null,
                  archivedAt: { not: null },
                  contextId: { in: companyContextIds },
                },
                select: { id: true },
              })
              .then((r) => r.map((d) => d.id))
          : [];
      const hasDocAccess = companyLead || archivedDocIds.some((id) => writableDocSet.has(id));
      if (!companyLead && !hasContextAccess && !hasDocAccess) {
        return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
      }

      for (const p of archivedProcs) {
        if (companyLead || writableCtxSet.has(p.contextId)) {
          allItems.push({
            type: 'process',
            id: p.id,
            displayTitle: p.name,
            contextName: '-',
            archivedAt: p.archivedAt?.toISOString() ?? '',
          });
        }
      }
      for (const p of archivedProjs) {
        if (companyLead || writableCtxSet.has(p.contextId)) {
          allItems.push({
            type: 'project',
            id: p.id,
            displayTitle: p.name,
            contextName: '-',
            archivedAt: p.archivedAt?.toISOString() ?? '',
          });
        }
      }
      const writableDocIds = [...writableDocSet];
      const archivedDocs = await prisma.document.findMany({
        where: {
          deletedAt: null,
          archivedAt: { not: null },
          ...(companyLead
            ? companyContextIds.length > 0
              ? { contextId: { in: companyContextIds } }
              : { id: { in: [] } }
            : {
                OR: [
                  ...(companyContextIds.length > 0
                    ? [{ contextId: { in: companyContextIds } }]
                    : []),
                  ...(writableDocIds.length > 0 ? [{ id: { in: writableDocIds } }] : []),
                ].filter(Boolean),
              }),
        },
        select: {
          id: true,
          title: true,
          contextId: true,
          archivedAt: true,
          ...archiveContextInclude,
        },
      });
      for (const d of archivedDocs) {
        allItems.push({
          type: 'document',
          id: d.id,
          displayTitle: d.title,
          contextName: contextNameFromDoc(d),
          archivedAt: d.archivedAt?.toISOString() ?? '',
        });
      }
    } else if (query.scope === 'department' && query.departmentId != null) {
      const departmentId = query.departmentId;
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
        select: { companyId: true },
      });
      if (!department) {
        return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
      }
      const [
        writable,
        scopeLeadDept,
        scopeLeadCompany,
        archivedProcs,
        archivedProjs,
        scopeContextIds,
      ] = await Promise.all([
        getWritableCatalogScope(prisma, userId),
        canViewDepartment(prisma, userId, departmentId),
        canViewCompany(prisma, userId, department.companyId ?? ''),
        prisma.process.findMany({
          where: { archivedAt: { not: null }, deletedAt: null, owner: { departmentId } },
          select: { id: true, name: true, contextId: true, archivedAt: true },
        }),
        prisma.project.findMany({
          where: { archivedAt: { not: null }, deletedAt: null, owner: { departmentId } },
          select: { id: true, name: true, contextId: true, archivedAt: true },
        }),
        getDepartmentContextIds(prisma, departmentId),
      ]);
      const scopeLead = scopeLeadDept || (department.companyId != null && scopeLeadCompany);
      const writableCtxSet = new Set(writable.contextIds);
      const writableDocSet = new Set(writable.documentIdsFromGrants);
      const hasContextAccess =
        archivedProcs.some((p) => writableCtxSet.has(p.contextId)) ||
        archivedProjs.some((p) => writableCtxSet.has(p.contextId));
      const archivedDocIds =
        scopeContextIds.length > 0
          ? await prisma.document
              .findMany({
                where: {
                  deletedAt: null,
                  archivedAt: { not: null },
                  contextId: { in: scopeContextIds },
                },
                select: { id: true },
              })
              .then((r) => r.map((d) => d.id))
          : [];
      const hasDocAccess = scopeLead || archivedDocIds.some((id) => writableDocSet.has(id));
      if (!scopeLead && !hasContextAccess && !hasDocAccess) {
        return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
      }
      for (const p of archivedProcs) {
        if (scopeLead || writableCtxSet.has(p.contextId)) {
          allItems.push({
            type: 'process',
            id: p.id,
            displayTitle: p.name,
            contextName: '-',
            archivedAt: p.archivedAt?.toISOString() ?? '',
          });
        }
      }
      for (const p of archivedProjs) {
        if (scopeLead || writableCtxSet.has(p.contextId)) {
          allItems.push({
            type: 'project',
            id: p.id,
            displayTitle: p.name,
            contextName: '-',
            archivedAt: p.archivedAt?.toISOString() ?? '',
          });
        }
      }
      const writableDocIds = [...writableDocSet];
      const archivedDocs = await prisma.document.findMany({
        where: {
          deletedAt: null,
          archivedAt: { not: null },
          ...(scopeLead
            ? scopeContextIds.length > 0
              ? { contextId: { in: scopeContextIds } }
              : { id: { in: [] } }
            : {
                OR: [
                  ...(scopeContextIds.length > 0 ? [{ contextId: { in: scopeContextIds } }] : []),
                  ...(writableDocIds.length > 0 ? [{ id: { in: writableDocIds } }] : []),
                ].filter(Boolean),
              }),
        },
        select: {
          id: true,
          title: true,
          contextId: true,
          archivedAt: true,
          ...archiveContextInclude,
        },
      });
      for (const d of archivedDocs) {
        allItems.push({
          type: 'document',
          id: d.id,
          displayTitle: d.title,
          contextName: contextNameFromDoc(d),
          archivedAt: d.archivedAt?.toISOString() ?? '',
        });
      }
    } else if (query.scope === 'team' && query.teamId != null) {
      const teamId = query.teamId;
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { departmentId: true, department: { select: { companyId: true } } },
      });
      if (!team) {
        return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
      }
      const companyId = team.department?.companyId ?? null;
      const [
        writable,
        scopeLeadDept,
        scopeLeadCompany,
        isTeamLead,
        archivedProcs,
        archivedProjs,
        scopeContextIds,
      ] = await Promise.all([
        getWritableCatalogScope(prisma, userId),
        team.departmentId != null
          ? canViewDepartment(prisma, userId, team.departmentId)
          : Promise.resolve(false),
        companyId != null ? canViewCompany(prisma, userId, companyId) : Promise.resolve(false),
        prisma.teamLead
          .findUnique({
            where: { teamId_userId: { teamId, userId } },
            select: { userId: true },
          })
          .then((r) => r != null),
        prisma.process.findMany({
          where: { archivedAt: { not: null }, deletedAt: null, owner: { teamId } },
          select: { id: true, name: true, contextId: true, archivedAt: true },
        }),
        prisma.project.findMany({
          where: { archivedAt: { not: null }, deletedAt: null, owner: { teamId } },
          select: { id: true, name: true, contextId: true, archivedAt: true },
        }),
        getTeamContextIds(prisma, teamId),
      ]);
      const scopeLead = scopeLeadDept || scopeLeadCompany || isTeamLead;
      const writableCtxSet = new Set(writable.contextIds);
      const writableDocSet = new Set(writable.documentIdsFromGrants);
      const hasContextAccess =
        archivedProcs.some((p) => writableCtxSet.has(p.contextId)) ||
        archivedProjs.some((p) => writableCtxSet.has(p.contextId));
      const archivedDocIds =
        scopeContextIds.length > 0
          ? await prisma.document
              .findMany({
                where: {
                  deletedAt: null,
                  archivedAt: { not: null },
                  contextId: { in: scopeContextIds },
                },
                select: { id: true },
              })
              .then((r) => r.map((d) => d.id))
          : [];
      const hasDocAccess = scopeLead || archivedDocIds.some((id) => writableDocSet.has(id));
      if (!scopeLead && !hasContextAccess && !hasDocAccess) {
        return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
      }
      for (const p of archivedProcs) {
        if (scopeLead || writableCtxSet.has(p.contextId)) {
          allItems.push({
            type: 'process',
            id: p.id,
            displayTitle: p.name,
            contextName: '-',
            archivedAt: p.archivedAt?.toISOString() ?? '',
          });
        }
      }
      for (const p of archivedProjs) {
        if (scopeLead || writableCtxSet.has(p.contextId)) {
          allItems.push({
            type: 'project',
            id: p.id,
            displayTitle: p.name,
            contextName: '-',
            archivedAt: p.archivedAt?.toISOString() ?? '',
          });
        }
      }
      const writableDocIds = [...writableDocSet];
      const archivedDocs = await prisma.document.findMany({
        where: {
          deletedAt: null,
          archivedAt: { not: null },
          ...(scopeLead
            ? scopeContextIds.length > 0
              ? { contextId: { in: scopeContextIds } }
              : { id: { in: [] } }
            : {
                OR: [
                  ...(scopeContextIds.length > 0 ? [{ contextId: { in: scopeContextIds } }] : []),
                  ...(writableDocIds.length > 0 ? [{ id: { in: writableDocIds } }] : []),
                ].filter(Boolean),
              }),
        },
        select: {
          id: true,
          title: true,
          contextId: true,
          archivedAt: true,
          ...archiveContextInclude,
        },
      });
      for (const d of archivedDocs) {
        allItems.push({
          type: 'document',
          id: d.id,
          displayTitle: d.title,
          contextName: contextNameFromDoc(d),
          archivedAt: d.archivedAt?.toISOString() ?? '',
        });
      }
    }

    const sortKey = query.sortBy === 'title' ? 'displayTitle' : 'archivedAt';
    const sortVal = (a: MeTrashArchiveItem) =>
      sortKey === 'displayTitle' ? (a.displayTitle ?? '').toLowerCase() : (a.archivedAt ?? '');
    allItems.sort((a, b) => {
      const va = sortVal(a);
      const vb = sortVal(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return query.sortOrder === 'asc' ? cmp : -cmp;
    });
    const filtered = query.type != null ? allItems.filter((i) => i.type === query.type) : allItems;
    const total = filtered.length;
    const items = filtered.slice(query.offset, query.offset + query.limit);
    return reply.send({ items, total, limit: query.limit, offset: query.offset });
  });

  /** GET /api/v1/me/can-write-in-scope – Whether the user has write access in the given scope (§4b: lead or writable). */
  app.get(
    '/me/can-write-in-scope',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const query = meCanWriteInScopeQuerySchema.parse(request.query);

      if (query.scope === 'company' && query.companyId != null) {
        const companyId = query.companyId;
        const [scopeLead, scopeContextIds, writable] = await Promise.all([
          canViewCompany(prisma, userId, companyId),
          getCompanyContextIds(prisma, companyId),
          getWritableCatalogScope(prisma, userId),
        ]);
        if (scopeLead) return reply.send({ canWrite: true });
        const writableCtxSet = new Set(writable.contextIds);
        if (scopeContextIds.some((id) => writableCtxSet.has(id)))
          return reply.send({ canWrite: true });
        if (scopeContextIds.length > 0 && writable.documentIdsFromGrants.length > 0) {
          const docInScope = await prisma.document.findFirst({
            where: {
              contextId: { in: scopeContextIds },
              id: { in: writable.documentIdsFromGrants },
            },
            select: { id: true },
          });
          if (docInScope) return reply.send({ canWrite: true });
        }
        return reply.send({ canWrite: false });
      }

      if (query.scope === 'department' && query.departmentId != null) {
        const departmentId = query.departmentId;
        const department = await prisma.department.findUnique({
          where: { id: departmentId },
          select: { companyId: true },
        });
        if (!department) return reply.send({ canWrite: false });
        const [scopeLeadDept, scopeLeadCompany, scopeContextIds, writable] = await Promise.all([
          canViewDepartment(prisma, userId, departmentId),
          canViewCompany(prisma, userId, department.companyId ?? ''),
          getDepartmentContextIds(prisma, departmentId),
          getWritableCatalogScope(prisma, userId),
        ]);
        const scopeLead = scopeLeadDept || (department.companyId != null && scopeLeadCompany);
        if (scopeLead) return reply.send({ canWrite: true });
        const writableCtxSet = new Set(writable.contextIds);
        if (scopeContextIds.some((id) => writableCtxSet.has(id)))
          return reply.send({ canWrite: true });
        if (scopeContextIds.length > 0 && writable.documentIdsFromGrants.length > 0) {
          const docInScope = await prisma.document.findFirst({
            where: {
              contextId: { in: scopeContextIds },
              id: { in: writable.documentIdsFromGrants },
            },
            select: { id: true },
          });
          if (docInScope) return reply.send({ canWrite: true });
        }
        return reply.send({ canWrite: false });
      }

      if (query.scope === 'team' && query.teamId != null) {
        const teamId = query.teamId;
        const team = await prisma.team.findUnique({
          where: { id: teamId },
          select: { departmentId: true, department: { select: { companyId: true } } },
        });
        if (!team) return reply.send({ canWrite: false });
        const companyId = team.department?.companyId ?? null;
        const [scopeLeadDept, scopeLeadCompany, isTeamLead, scopeContextIds, writable] =
          await Promise.all([
            team.departmentId != null
              ? canViewDepartment(prisma, userId, team.departmentId)
              : Promise.resolve(false),
            companyId != null ? canViewCompany(prisma, userId, companyId) : Promise.resolve(false),
            prisma.teamLead
              .findUnique({
                where: { teamId_userId: { teamId, userId } },
                select: { userId: true },
              })
              .then((r) => r != null),
            getTeamContextIds(prisma, teamId),
            getWritableCatalogScope(prisma, userId),
          ]);
        const scopeLead = scopeLeadDept || scopeLeadCompany || isTeamLead;
        if (scopeLead) return reply.send({ canWrite: true });
        const writableCtxSet = new Set(writable.contextIds);
        if (scopeContextIds.some((id) => writableCtxSet.has(id)))
          return reply.send({ canWrite: true });
        if (scopeContextIds.length > 0 && writable.documentIdsFromGrants.length > 0) {
          const docInScope = await prisma.document.findFirst({
            where: {
              contextId: { in: scopeContextIds },
              id: { in: writable.documentIdsFromGrants },
            },
            select: { id: true },
          });
          if (docInScope) return reply.send({ canWrite: true });
        }
        return reply.send({ canWrite: false });
      }

      return reply.send({ canWrite: false });
    }
  );

  /** GET /api/v1/me/shared-documents – Dokumente, auf die der Nutzer per Grant Zugriff hat (paginiert). */
  app.get('/me/shared-documents', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query: PaginationQuery = paginationQuerySchema.parse(request.query);

    const [userGrantDocIds, teamGrantDocIds, deptGrantDocIds] = await Promise.all([
      prisma.documentGrantUser
        .findMany({ where: { userId }, select: { documentId: true } })
        .then((rows) => rows.map((r) => r.documentId)),
      prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } }).then((teamIds) =>
        prisma.documentGrantTeam
          .findMany({
            where: { teamId: { in: teamIds.map((t) => t.teamId) } },
            select: { documentId: true },
          })
          .then((rows) => rows.map((r) => r.documentId))
      ),
      prisma.teamMember
        .findMany({
          where: { userId },
          include: { team: { select: { departmentId: true } } },
        })
        .then((members) => [...new Set(members.map((m) => m.team.departmentId))])
        .then((departmentIds) =>
          departmentIds.length === 0
            ? Promise.resolve([] as string[])
            : prisma.documentGrantDepartment
                .findMany({
                  where: { departmentId: { in: departmentIds } },
                  select: { documentId: true },
                })
                .then((rows) => rows.map((r) => r.documentId))
        ),
    ]);

    const documentIds = [...new Set([...userGrantDocIds, ...teamGrantDocIds, ...deptGrantDocIds])];
    if (documentIds.length === 0) {
      return reply.send({
        items: [],
        total: 0,
        limit: query.limit,
        offset: query.offset,
      });
    }

    const [items, total] = await Promise.all([
      prisma.document.findMany({
        where: {
          id: { in: documentIds },
          deletedAt: null,
          archivedAt: null,
        },
        select: {
          id: true,
          title: true,
          contextId: true,
          createdAt: true,
          updatedAt: true,
          documentTags: { include: { tag: { select: { id: true, name: true } } } },
        },
        take: query.limit,
        skip: query.offset,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.document.count({
        where: {
          id: { in: documentIds },
          deletedAt: null,
          archivedAt: null,
        },
      }),
    ]);
    return reply.send({ items, total, limit: query.limit, offset: query.offset });
  });

  /** GET /api/v1/me/drafts – Draft documents and open draft requests in scope (or all). */
  app.get('/me/drafts', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = meDraftsQuerySchema.parse(request.query);

    const [scope, writable] = await Promise.all([
      getDraftsScope(prisma, userId, query),
      getWritableCatalogScope(prisma, userId),
    ]);

    const writableCtxSet = new Set(writable.contextIds);
    const writableDocSet = new Set(writable.documentIdsFromGrants);
    const includeContextFreeDrafts =
      query.scope === 'personal' ||
      (!query.scope && !query.companyId && !query.departmentId && !query.teamId);
    const inScopeWritableContextIds = scope.scopeContextIds.filter((c) => writableCtxSet.has(c));
    const inScopeWritableDocIds = [
      ...scope.scopeDocumentIds.filter((d) => writableDocSet.has(d)),
      ...(includeContextFreeDrafts ? writable.documentIdsFromCreator : []),
    ];

    const draftDocWhere =
      inScopeWritableContextIds.length > 0 || inScopeWritableDocIds.length > 0
        ? {
            deletedAt: null,
            archivedAt: null,
            publishedAt: null,
            OR: [
              ...(inScopeWritableContextIds.length > 0
                ? [{ contextId: { in: inScopeWritableContextIds } }]
                : []),
              ...(inScopeWritableDocIds.length > 0 ? [{ id: { in: inScopeWritableDocIds } }] : []),
            ] as { contextId?: { in: string[] }; id?: { in: string[] } }[],
          }
        : null;

    const draftDocuments = draftDocWhere
      ? await prisma.document.findMany({
          where: draftDocWhere,
          select: {
            id: true,
            title: true,
            contextId: true,
            updatedAt: true,
            createdAt: true,
          },
          take: query.limit,
          skip: query.offset,
          orderBy: { updatedAt: 'desc' },
        })
      : [];

    /** §4b: Offene Draft Requests nur für Schreiber (writable), nicht für Leser. */
    let writableDocIdsForPrs: string[] = [...inScopeWritableDocIds];
    if (inScopeWritableContextIds.length > 0) {
      const fromContexts = await prisma.document.findMany({
        where: {
          contextId: { in: inScopeWritableContextIds },
          deletedAt: null,
          archivedAt: null,
        },
        select: { id: true },
      });
      writableDocIdsForPrs = [
        ...new Set([...writableDocIdsForPrs, ...fromContexts.map((d) => d.id)]),
      ];
    }
    const openDraftRequests =
      writableDocIdsForPrs.length > 0
        ? await prisma.draftRequest.findMany({
            where: {
              status: 'open',
              documentId: { in: writableDocIdsForPrs },
            },
            select: {
              id: true,
              documentId: true,
              submittedAt: true,
              status: true,
              document: { select: { title: true } },
              submittedBy: { select: { id: true, name: true } },
            },
            orderBy: { submittedAt: 'desc' },
            take: query.limit,
            skip: query.offset,
          })
        : [];

    return reply.send({
      draftDocuments,
      openDraftRequests: openDraftRequests.map((dr) => ({
        id: dr.id,
        documentId: dr.documentId,
        documentTitle: dr.document.title,
        submittedById: dr.submittedBy.id,
        submittedByName: dr.submittedBy.name,
        submittedAt: dr.submittedAt,
        status: dr.status,
      })),
      limit: query.limit,
      offset: query.offset,
    });
  });

  /** PATCH /api/v1/me – eigenes Profil (nur Anzeigename). */
  app.patch('/me', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const body = patchMeBodySchema.parse(request.body);
    const updated = await request.server.prisma.user.update({
      where: { id: userId },
      data: { name: body.name },
      select: { id: true, name: true, email: true, isAdmin: true },
    });
    const prisma = request.server.prisma;
    const owners = await prisma.owner.findMany({
      where: { ownerUserId: userId },
      select: { id: true },
    });
    for (const o of owners) {
      await setOwnerDisplayName(prisma, o.id);
      await refreshContextOwnerDisplayForOwner(prisma, o.id);
    }
    return reply.send(updated);
  });

  /** GET /api/v1/me/storage – Speicherverbrauch (eigen oder Team/Department/Company für Leads). */

  app.get('/me/storage', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = meStorageQuerySchema.parse(request.query);
    const scope = query.scope ?? 'personal';

    if (scope === 'team' && query.teamId) {
      const allowed = await canPinForScope(prisma, userId, 'team', query.teamId);
      if (!allowed) return reply.status(403).send({ error: 'Not allowed to view team storage' });
    } else if (scope === 'department' && query.departmentId) {
      const allowed = await canPinForScope(prisma, userId, 'department', query.departmentId);
      if (!allowed)
        return reply.status(403).send({ error: 'Not allowed to view department storage' });
    } else if (scope === 'company' && query.companyId) {
      const allowed = await canPinForScope(prisma, userId, 'company', query.companyId);
      if (!allowed) return reply.status(403).send({ error: 'Not allowed to view company storage' });
    }

    let userIds: string[];
    if (scope === 'personal') {
      userIds = [userId];
    } else if (scope === 'team' && query.teamId) {
      const members = await prisma.teamMember.findMany({
        where: { teamId: query.teamId },
        select: { userId: true },
      });
      userIds = members.map((m) => m.userId);
    } else if (scope === 'department' && query.departmentId) {
      const teams = await prisma.team.findMany({
        where: { departmentId: query.departmentId },
        select: { id: true },
      });
      const teamIds = teams.map((t) => t.id);
      const members = await prisma.teamMember.findMany({
        where: { teamId: { in: teamIds } },
        select: { userId: true },
      });
      userIds = [...new Set(members.map((m) => m.userId))];
    } else if (scope === 'company' && query.companyId) {
      const departments = await prisma.department.findMany({
        where: { companyId: query.companyId },
        select: { id: true },
      });
      const departmentIds = departments.map((d) => d.id);
      const teams = await prisma.team.findMany({
        where: { departmentId: { in: departmentIds } },
        select: { id: true },
      });
      const teamIds = teams.map((t) => t.id);
      const members = await prisma.teamMember.findMany({
        where: { teamId: { in: teamIds } },
        select: { userId: true },
      });
      userIds = [...new Set(members.map((m) => m.userId))];
    } else {
      userIds = [userId];
    }

    const where = { uploadedById: { in: userIds } };
    const [sumResult, attachmentCount, byUserRows] = await Promise.all([
      prisma.documentAttachment.aggregate({
        where,
        _sum: { sizeBytes: true },
      }),
      prisma.documentAttachment.count({ where }),
      scope !== 'personal'
        ? prisma.documentAttachment.groupBy({
            by: ['uploadedById'],
            where: { ...where, uploadedById: { not: null } },
            _sum: { sizeBytes: true },
            _count: true,
          })
        : Promise.resolve([]),
    ]);

    const usedBytes = Number(sumResult._sum.sizeBytes ?? 0);

    if (scope === 'personal') {
      return reply.send({ usedBytes, attachmentCount });
    }

    const byUserIds = new Set(
      (byUserRows as { uploadedById: string | null }[])
        .map((r) => r.uploadedById)
        .filter((id): id is string => id != null)
    );
    const users =
      byUserIds.size > 0
        ? await prisma.user.findMany({
            where: { id: { in: [...byUserIds] } },
            select: { id: true, name: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u.name]));
    const byUser = (
      byUserRows as {
        uploadedById: string | null;
        _sum: { sizeBytes: number | null };
        _count: number;
      }[]
    ).map((r) => ({
      userId: r.uploadedById!,
      name: userMap.get(r.uploadedById!) ?? '',
      usedBytes: r._sum.sizeBytes ?? 0,
    }));
    return reply.send({ usedBytes, attachmentCount, byUser });
  });

  /** POST /api/v1/me/deactivate – Self-Deactivate (setzt deletedAt). Letzter Admin darf nicht. */
  app.post('/me/deactivate', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const user = await request.server.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (user.isAdmin) {
      const otherAdmins = await request.server.prisma.user.count({
        where: { isAdmin: true, deletedAt: null, id: { not: userId } },
      });
      if (otherAdmins === 0) {
        return reply.status(403).send({
          error:
            'The last administrator cannot deactivate their account. Please create another admin first.',
        });
      }
    }
    await request.server.prisma.session.deleteMany({ where: { userId } });
    await request.server.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });
    return reply.status(204).send();
  });

  /** GET /api/v1/me/preferences – nur Preferences (effektiver User bei Impersonation). */
  app.get('/me/preferences', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = getEffectiveUserId(request as RequestWithUser);
    const user = await request.server.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferences: true },
    });
    const preferences: UserPreferences =
      user.preferences != null && typeof user.preferences === 'object'
        ? (user.preferences as UserPreferences)
        : {};
    return reply.send(preferences);
  });

  /** PATCH /api/v1/me/preferences – Theme, sidebarPinned (partielles Merge). */
  app.patch('/me/preferences', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const body = patchPreferencesBodySchema.parse(request.body);

    const current = await request.server.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferences: true },
    });
    const currentPrefs: UserPreferences =
      current.preferences != null && typeof current.preferences === 'object'
        ? (current.preferences as UserPreferences)
        : {};
    let recentItemsByScope = currentPrefs.recentItemsByScope ?? {};
    if (body.recentItemsByScope !== undefined) {
      recentItemsByScope = { ...recentItemsByScope };
      for (const [scopeKey, list] of Object.entries(body.recentItemsByScope)) {
        const seen = new Set<string>();
        const deduped = list
          .filter((item) => {
            const key = `${item.type}:${item.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 8);
        recentItemsByScope[scopeKey] = deduped;
      }
    }
    const merged: UserPreferences = {
      ...currentPrefs,
      ...(body.theme !== undefined && { theme: body.theme }),
      ...(body.sidebarPinned !== undefined && { sidebarPinned: body.sidebarPinned }),
      ...(body.scopeRecentPanelOpen !== undefined && {
        scopeRecentPanelOpen: body.scopeRecentPanelOpen,
      }),
      ...(body.locale !== undefined && { locale: body.locale }),
      ...(body.primaryColor !== undefined && { primaryColor: body.primaryColor }),
      ...(body.recentItemsByScope !== undefined && { recentItemsByScope }),
    };

    await request.server.prisma.user.update({
      where: { id: userId },
      data: { preferences: merged as object },
    });
    return reply.send(merged);
  });

  /** PATCH /api/v1/me/account – E-Mail und/oder Passwort (nur bei lokalem Login). */
  app.patch('/me/account', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const body = patchAccountBodySchema.parse(request.body);

    const user = await request.server.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true, email: true },
    });
    if (user.passwordHash == null) {
      return reply.status(400).send({
        error: 'Account is managed by SSO. Email and password cannot be changed here.',
      });
    }

    const data: { email?: string | null; passwordHash?: string } = {};

    if (body.email !== undefined) {
      if (body.email !== null) {
        const existing = await request.server.prisma.user.findUnique({
          where: { email: body.email },
          select: { id: true },
        });
        if (existing && existing.id !== userId) {
          return reply.status(409).send({ error: 'This email address is already in use.' });
        }
      }
      data.email = body.email;
    }

    if (body.newPassword !== undefined) {
      if (!body.currentPassword) {
        return reply
          .status(400)
          .send({ error: 'Current password is required to change password.' });
      }
      const valid = await verifyPassword(user.passwordHash, body.currentPassword);
      if (!valid) {
        return reply.status(401).send({ error: 'Current password is incorrect.' });
      }
      data.passwordHash = await hashPassword(body.newPassword);
    }

    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'Nothing to update (provide email or newPassword).' });
    }

    await request.server.prisma.user.update({
      where: { id: userId },
      data,
    });
    return reply.status(204).send();
  });

  /** GET /api/v1/me/sessions – Liste der Sessions mit isCurrent. */
  app.get('/me/sessions', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const currentSessionId = request.cookies[SESSION_COOKIE_NAME] ?? null;

    const sessions = await request.server.prisma.session.findMany({
      where: { userId },
      select: { id: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const list = sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: currentSessionId === s.id,
    }));
    return reply.send({ sessions: list });
  });

  /** DELETE /api/v1/me/sessions – alle anderen Sessions beenden (außer aktueller). */
  app.delete('/me/sessions', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const currentSessionId = request.cookies[SESSION_COOKIE_NAME];
    if (currentSessionId) {
      await request.server.prisma.session.deleteMany({
        where: { userId, id: { not: currentSessionId } },
      });
    }
    return reply.status(204).send();
  });

  /** DELETE /api/v1/me/sessions/:sessionId – einzelne Session widerrufen. */
  app.delete<{ Params: { sessionId: string } }>(
    '/me/sessions/:sessionId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const userId = (request as { user: RequestUser }).user.id;
      const { sessionId } = sessionIdParamSchema.parse(request.params);

      const session = await request.server.prisma.session.findFirst({
        where: { id: sessionId, userId },
      });
      if (!session) {
        return reply.status(404).send({ error: 'Session not found.' });
      }
      await request.server.prisma.session.delete({ where: { id: sessionId } });
      return reply.status(204).send();
    }
  );

  return Promise.resolve();
};

export default meRoutes;
