import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
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
  meNotificationsQuerySchema,
  notificationIdParamSchema,
  markAllNotificationsReadBodySchema,
  type MeDraftsQuery,
  type MeTrashArchiveItem,
} from './schemas/me.js';
export type { MeTrashArchiveItem } from './schemas/me.js';
import { canPinForScope } from '../permissions/pinnedPermissions.js';
import { paginationQuerySchema } from './schemas/organisation.js';
import {
  getReadableCatalogScope,
  getWritableCatalogScope,
} from '../permissions/catalogPermissions.js';
import { type ScopeRef } from '../permissions/scopeResolution.js';
import { canWriteInScope } from '../permissions/scopeLead.js';
import {
  getTrashOrArchiveItems,
  contextNameFromDoc,
  trashArchiveContextSelect,
} from './meTrashArchive.js';
import { setOwnerDisplayName, refreshContextOwnerDisplayForOwner } from '../contextOwnerDisplay.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { Prisma } from '../../generated/prisma/client.js';

function scopeRefFromQuery(q: {
  scope: string;
  companyId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
}): ScopeRef | null {
  if (q.scope === 'company' && q.companyId) return { type: 'company', companyId: q.companyId };
  if (q.scope === 'department' && q.departmentId)
    return { type: 'department', departmentId: q.departmentId };
  if (q.scope === 'team' && q.teamId) return { type: 'team', teamId: q.teamId };
  return null;
}

/** Ein Eintrag in „Zuletzt angesehene“ (process/project/document). */
export type RecentPreferencesItem = {
  type: 'process' | 'project' | 'document';
  id: string;
  name?: string;
};

/** User-Preferences: theme, sidebarPinned, scopeRecentPanelOpen, locale, primaryColor, textSize, recentItemsByScope. Defaults in App, nicht in DB. */
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
  /** UI text scale (Mantine theme scale). */
  textSize?: 'default' | 'large' | 'larger';
  /** Pro Scope (company/department/team) eine Liste; Key z. B. "company:cid", "department:did", "team:tid". */
  recentItemsByScope?: Record<string, RecentPreferencesItem[]>;
  notificationSettings?: {
    inApp?: {
      documentChanges?: boolean;
      draftRequests?: boolean;
      reminders?: boolean;
    };
    email?: {
      documentChanges?: boolean;
      draftRequests?: boolean;
      reminders?: boolean;
    };
  };
};

/** Owner select for resolving scope (team/department/company/personal) and display name. */
const ownerScopeSelect = {
  teamId: true,
  departmentId: true,
  companyId: true,
  ownerUserId: true,
  displayName: true,
} as const;

type OwnerScopeRow = {
  teamId: string | null;
  departmentId: string | null;
  companyId: string | null;
  ownerUserId: string | null;
  displayName: string | null;
};

function getScopeFromOwner(owner: OwnerScopeRow | null): {
  scopeType: 'team' | 'department' | 'company' | 'personal';
  scopeId: string | null;
  scopeName: string;
} {
  if (!owner) {
    return { scopeType: 'personal', scopeId: null, scopeName: 'Personal' };
  }
  const name = owner.displayName?.trim() || 'Personal';
  if (owner.teamId) return { scopeType: 'team', scopeId: owner.teamId, scopeName: name };
  if (owner.departmentId)
    return { scopeType: 'department', scopeId: owner.departmentId, scopeName: name };
  if (owner.companyId) return { scopeType: 'company', scopeId: owner.companyId, scopeName: name };
  return { scopeType: 'personal', scopeId: null, scopeName: name };
}

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

  /** GET /api/v1/me/personal-documents – Documents in the user's personal processes/projects (paginated). Includes both drafts and published. */
  app.get(
    '/me/personal-documents',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const query = paginationQuerySchema
        .extend({ publishedOnly: z.coerce.boolean().optional().default(false) })
        .parse(request.query);

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

      const documentWhere = {
        contextId: { in: personalContextIds },
        deletedAt: null,
        archivedAt: null,
        ...(query.publishedOnly ? { publishedAt: { not: null } } : {}),
      };

      const [items, total] = await Promise.all([
        prisma.document.findMany({
          where: documentWhere,
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
          where: documentWhere,
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
            ...trashArchiveContextSelect,
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
    } else {
      // Schema guarantees companyId/departmentId/teamId when scope is company/department/team
      const scopeRef: ScopeRef =
        query.scope === 'company'
          ? { type: 'company', companyId: query.companyId! }
          : query.scope === 'department'
            ? { type: 'department', departmentId: query.departmentId! }
            : { type: 'team', teamId: query.teamId! };
      const result = await getTrashOrArchiveItems(prisma, userId, scopeRef, 'trash');
      if ('emptyReason' in result) {
        return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
      }
      allItems.push(...result.items);
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
          select: { id: true, title: true, archivedAt: true, ...trashArchiveContextSelect },
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
    } else {
      // Schema guarantees companyId/departmentId/teamId when scope is company/department/team
      const scopeRef: ScopeRef =
        query.scope === 'company'
          ? { type: 'company', companyId: query.companyId! }
          : query.scope === 'department'
            ? { type: 'department', departmentId: query.departmentId! }
            : { type: 'team', teamId: query.teamId! };
      const result = await getTrashOrArchiveItems(prisma, userId, scopeRef, 'archive');
      if ('emptyReason' in result) {
        return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
      }
      allItems.push(...result.items);
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

      const scopeRef = scopeRefFromQuery(query);
      if (!scopeRef) return reply.send({ canWrite: false });

      if (scopeRef.type === 'department') {
        const dept = await prisma.department.findUnique({
          where: { id: scopeRef.departmentId },
          select: { id: true },
        });
        if (!dept) return reply.send({ canWrite: false });
      }
      if (scopeRef.type === 'team') {
        const team = await prisma.team.findUnique({
          where: { id: scopeRef.teamId },
          select: { id: true },
        });
        if (!team) return reply.send({ canWrite: false });
      }

      const canWrite = await canWriteInScope(prisma, userId, scopeRef);
      return reply.send({ canWrite });
    }
  );

  /** GET /api/v1/me/shared-documents – Dokumente, auf die der Nutzer per Grant Zugriff hat (paginiert). */
  app.get('/me/shared-documents', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = paginationQuerySchema
      .extend({ publishedOnly: z.coerce.boolean().optional().default(false) })
      .parse(request.query);

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

    const sharedDocumentWhere = {
      id: { in: documentIds },
      deletedAt: null,
      archivedAt: null,
      ...(query.publishedOnly ? { publishedAt: { not: null } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.document.findMany({
        where: sharedDocumentWhere,
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
        where: sharedDocumentWhere,
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

    const [draftDocumentsRaw, totalDrafts] =
      draftDocWhere != null
        ? await Promise.all([
            prisma.document.findMany({
              where: draftDocWhere,
              select: {
                id: true,
                title: true,
                contextId: true,
                updatedAt: true,
                createdAt: true,
                context: {
                  select: {
                    process: { select: { owner: { select: ownerScopeSelect } } },
                    project: { select: { owner: { select: ownerScopeSelect } } },
                    subcontext: {
                      select: { project: { select: { owner: { select: ownerScopeSelect } } } },
                    },
                  },
                },
              },
              take: query.limit,
              skip: query.offset,
              orderBy: { updatedAt: 'desc' },
            }),
            prisma.document.count({ where: draftDocWhere }),
          ])
        : [[], 0];
    const draftDocuments = draftDocumentsRaw.map((d) => {
      const owner =
        d.context?.process?.owner ??
        d.context?.project?.owner ??
        d.context?.subcontext?.project?.owner ??
        null;
      const scope = getScopeFromOwner(owner);
      return {
        id: d.id,
        title: d.title,
        contextId: d.contextId,
        updatedAt: d.updatedAt,
        createdAt: d.createdAt,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        scopeName: scope.scopeName,
      };
    });

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
    const openDraftRequestsRaw =
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
              document: {
                select: {
                  title: true,
                  context: {
                    select: {
                      process: { select: { owner: { select: ownerScopeSelect } } },
                      project: { select: { owner: { select: ownerScopeSelect } } },
                      subcontext: {
                        select: { project: { select: { owner: { select: ownerScopeSelect } } } },
                      },
                    },
                  },
                },
              },
              submittedBy: { select: { id: true, name: true } },
            },
            orderBy: { submittedAt: 'desc' },
            take: query.limit,
            skip: query.offset,
          })
        : [];

    const openDraftRequests = openDraftRequestsRaw.map((dr) => {
      const owner =
        dr.document.context?.process?.owner ??
        dr.document.context?.project?.owner ??
        dr.document.context?.subcontext?.project?.owner ??
        null;
      const scope = getScopeFromOwner(owner);
      return {
        id: dr.id,
        documentId: dr.documentId,
        documentTitle: dr.document.title,
        submittedById: dr.submittedBy.id,
        submittedByName: dr.submittedBy.name,
        submittedAt: dr.submittedAt,
        status: dr.status,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        scopeName: scope.scopeName,
      };
    });

    return reply.send({
      draftDocuments,
      openDraftRequests,
      total: totalDrafts,
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
      ...(body.textSize !== undefined && { textSize: body.textSize }),
      ...(body.recentItemsByScope !== undefined && { recentItemsByScope }),
      ...(body.notificationSettings !== undefined && {
        notificationSettings: {
          inApp: {
            ...currentPrefs.notificationSettings?.inApp,
            ...body.notificationSettings.inApp,
          },
          email: {
            ...currentPrefs.notificationSettings?.email,
            ...body.notificationSettings.email,
          },
        },
      }),
    };

    await request.server.prisma.user.update({
      where: { id: userId },
      data: { preferences: merged as object },
    });
    return reply.send(merged);
  });

  /** GET /api/v1/me/notifications – persönliche In-App-Benachrichtigungen (paginiert). */
  app.get('/me/notifications', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = meNotificationsQuerySchema.parse(request.query);

    const unreadFilter = query.unreadOnly ? Prisma.sql`AND read_at IS NULL` : Prisma.empty;
    const [countRows, rows] = await Promise.all([
      request.server.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        FROM user_notification
        WHERE user_id = ${userId}
        ${unreadFilter}
      `),
      request.server.prisma.$queryRaw<
        Array<{
          id: string;
          event_type: string;
          payload: unknown;
          created_at: Date;
          read_at: Date | null;
        }>
      >(Prisma.sql`
        SELECT id, event_type, payload, created_at, read_at
        FROM user_notification
        WHERE user_id = ${userId}
        ${unreadFilter}
        ORDER BY created_at DESC
        LIMIT ${query.limit}
        OFFSET ${query.offset}
      `),
    ]);

    return reply.send({
      items: rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        payload: row.payload,
        createdAt: row.created_at,
        readAt: row.read_at,
      })),
      total: Number(countRows[0]?.total ?? 0n),
      limit: query.limit,
      offset: query.offset,
    });
  });

  /** PATCH /api/v1/me/notifications/:notificationId/read – einzelne Benachrichtigung als gelesen markieren. */
  app.patch<{ Params: { notificationId: string } }>(
    '/me/notifications/:notificationId/read',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { notificationId } = notificationIdParamSchema.parse(request.params);
      const rows = await request.server.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE user_notification
        SET read_at = COALESCE(read_at, NOW())
        WHERE id = ${notificationId}
          AND user_id = ${userId}
        RETURNING id
      `);
      if (rows.length === 0) return reply.status(404).send({ error: 'Notification not found' });
      return reply.status(204).send();
    }
  );

  /** PATCH /api/v1/me/notifications/read-all – alle (oder bis Zeitpunkt) als gelesen markieren. */
  app.patch(
    '/me/notifications/read-all',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const userId = getEffectiveUserId(request as RequestWithUser);
      const body = markAllNotificationsReadBodySchema.parse(request.body ?? {});
      const before = body.before ? new Date(body.before) : null;
      if (before && Number.isNaN(before.getTime())) {
        return reply.status(400).send({ error: 'Invalid before timestamp' });
      }
      await request.server.prisma.$executeRaw`
      UPDATE user_notification
      SET read_at = COALESCE(read_at, NOW())
      WHERE user_id = ${userId}
        AND (${before == null}::boolean OR created_at <= ${before})
    `;
      return reply.status(204).send();
    }
  );

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
