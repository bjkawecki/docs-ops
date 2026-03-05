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
  type MeDraftsQuery,
} from './schemas/me.js';
import { paginationQuerySchema, type PaginationQuery } from './schemas/organisation.js';
import {
  getReadableCatalogScope,
  getWritableCatalogScope,
} from '../permissions/catalogPermissions.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

/** Ein Eintrag in „Zuletzt angesehene“ (process/project/document). */
export type RecentPreferencesItem = {
  type: 'process' | 'project' | 'document';
  id: string;
  name?: string;
};

/** User-Preferences: theme, sidebarPinned, locale, recentItemsByScope. Defaults in App, nicht in DB. */
export type UserPreferences = {
  theme?: 'light' | 'dark' | 'auto';
  sidebarPinned?: boolean;
  locale?: 'en' | 'de';
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
          where: { contextId: { in: personalContextIds }, deletedAt: null },
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
          where: { contextId: { in: personalContextIds }, deletedAt: null },
        }),
      ]);
      return reply.send({ items, total, limit: query.limit, offset: query.offset });
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
        where: { id: { in: documentIds }, deletedAt: null },
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
        where: { id: { in: documentIds }, deletedAt: null },
      }),
    ]);
    return reply.send({ items, total, limit: query.limit, offset: query.offset });
  });

  /** GET /api/v1/me/drafts – Draft documents and open draft requests in scope (or all). */
  app.get('/me/drafts', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = meDraftsQuerySchema.parse(request.query);

    const [scope, writable, readable] = await Promise.all([
      getDraftsScope(prisma, userId, query),
      getWritableCatalogScope(prisma, userId),
      getReadableCatalogScope(prisma, userId),
    ]);

    const writableCtxSet = new Set(writable.contextIds);
    const writableDocSet = new Set(writable.documentIdsFromGrants);
    const readableCtxSet = new Set(readable.contextIds);
    const readableDocSet = new Set(readable.documentIdsFromGrants);

    const inScopeWritableContextIds = scope.scopeContextIds.filter((c) => writableCtxSet.has(c));
    const inScopeWritableDocIds = scope.scopeDocumentIds.filter((d) => writableDocSet.has(d));
    const inScopeReadableContextIds = scope.scopeContextIds.filter((c) => readableCtxSet.has(c));
    const inScopeReadableDocIdsFromGrants = scope.scopeDocumentIds.filter((d) =>
      readableDocSet.has(d)
    );

    const draftDocWhere =
      inScopeWritableContextIds.length > 0 || inScopeWritableDocIds.length > 0
        ? {
            deletedAt: null,
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

    let readableDocIdsInScope: string[] = [...inScopeReadableDocIdsFromGrants];
    if (inScopeReadableContextIds.length > 0) {
      const fromContexts = await prisma.document.findMany({
        where: { contextId: { in: inScopeReadableContextIds }, deletedAt: null },
        select: { id: true },
      });
      readableDocIdsInScope = [
        ...new Set([...readableDocIdsInScope, ...fromContexts.map((d) => d.id)]),
      ];
    }
    const openDraftRequests =
      readableDocIdsInScope.length > 0
        ? await prisma.draftRequest.findMany({
            where: {
              status: 'open',
              documentId: { in: readableDocIdsInScope },
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
    return reply.send(updated);
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
      ...(body.locale !== undefined && { locale: body.locale }),
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
