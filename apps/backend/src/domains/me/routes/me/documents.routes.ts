import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../../auth/middleware.js';
import { canWriteInScope } from '../../../organisation/permissions/scopeLead.js';
import { paginationQuerySchema } from '../../../organisation/schemas/organisation.js';
import { meCanWriteInScopeQuerySchema, meDraftsQuerySchema } from '../../schemas/me.js';
import {
  getDraftsScope,
  getScopeFromOwner,
  getWritableScope,
  ownerScopeSelect,
  scopeRefFromQuery,
} from './route-helpers.js';

function registerMeDocumentsRoutes(app: FastifyInstance): void {
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
        ...processContexts.map((item) => item.contextId),
        ...projectContexts.map((item) => item.contextId),
        ...subcontextContexts.map((item) => item.contextId),
      ];

      if (personalContextIds.length === 0) {
        return reply.send({
          items: [],
          total: 0,
          limit: query.limit,
          offset: query.offset,
        });
      }

      const where = {
        contextId: { in: personalContextIds },
        deletedAt: null,
        archivedAt: null,
        ...(query.publishedOnly ? { publishedAt: { not: null } } : {}),
      };

      const [items, total] = await Promise.all([
        prisma.document.findMany({
          where,
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
        prisma.document.count({ where }),
      ]);
      return reply.send({ items, total, limit: query.limit, offset: query.offset });
    }
  );

  app.get('/me/shared-documents', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = paginationQuerySchema
      .extend({ publishedOnly: z.coerce.boolean().optional().default(false) })
      .parse(request.query);

    const [userGrantDocIds, teamGrantDocIds, deptGrantDocIds] = await Promise.all([
      prisma.documentGrantUser
        .findMany({ where: { userId }, select: { documentId: true } })
        .then((rows) => rows.map((row) => row.documentId)),
      prisma.teamMember.findMany({ where: { userId }, select: { teamId: true } }).then((teamIds) =>
        prisma.documentGrantTeam
          .findMany({
            where: { teamId: { in: teamIds.map((team) => team.teamId) } },
            select: { documentId: true },
          })
          .then((rows) => rows.map((row) => row.documentId))
      ),
      prisma.teamMember
        .findMany({
          where: { userId },
          include: { team: { select: { departmentId: true } } },
        })
        .then((members) => [...new Set(members.map((member) => member.team.departmentId))])
        .then((departmentIds) =>
          departmentIds.length === 0
            ? Promise.resolve([] as string[])
            : prisma.documentGrantDepartment
                .findMany({
                  where: { departmentId: { in: departmentIds } },
                  select: { documentId: true },
                })
                .then((rows) => rows.map((row) => row.documentId))
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

    const where = {
      id: { in: documentIds },
      deletedAt: null,
      archivedAt: null,
      ...(query.publishedOnly ? { publishedAt: { not: null } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.document.findMany({
        where,
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
      prisma.document.count({ where }),
    ]);
    return reply.send({ items, total, limit: query.limit, offset: query.offset });
  });

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

  app.get('/me/drafts', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = meDraftsQuerySchema.parse(request.query);

    const [scope, writable] = await Promise.all([
      getDraftsScope(prisma, userId, query),
      getWritableScope(prisma, userId),
    ]);

    const writableContextSet = new Set(writable.contextIds);
    const writableDocumentSet = new Set(writable.documentIdsFromGrants);
    const includeContextFreeDrafts =
      query.scope === 'personal' ||
      (!query.scope && !query.companyId && !query.departmentId && !query.teamId);
    const inScopeWritableContextIds = scope.scopeContextIds.filter((id) =>
      writableContextSet.has(id)
    );
    const inScopeWritableDocumentIds = [
      ...scope.scopeDocumentIds.filter((id) => writableDocumentSet.has(id)),
      ...(includeContextFreeDrafts ? writable.documentIdsFromCreator : []),
    ];

    const draftDocWhere =
      inScopeWritableContextIds.length > 0 || inScopeWritableDocumentIds.length > 0
        ? {
            deletedAt: null,
            archivedAt: null,
            publishedAt: null,
            OR: [
              ...(inScopeWritableContextIds.length > 0
                ? [{ contextId: { in: inScopeWritableContextIds } }]
                : []),
              ...(inScopeWritableDocumentIds.length > 0
                ? [{ id: { in: inScopeWritableDocumentIds } }]
                : []),
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
    const draftDocuments = draftDocumentsRaw.map((doc) => {
      const owner =
        doc.context?.process?.owner ??
        doc.context?.project?.owner ??
        doc.context?.subcontext?.project?.owner ??
        null;
      const scopeFromOwner = getScopeFromOwner(owner);
      return {
        id: doc.id,
        title: doc.title,
        contextId: doc.contextId,
        updatedAt: doc.updatedAt,
        createdAt: doc.createdAt,
        scopeType: scopeFromOwner.scopeType,
        scopeId: scopeFromOwner.scopeId,
        scopeName: scopeFromOwner.scopeName,
      };
    });

    const openDraftRequests: never[] = [];

    return reply.send({
      draftDocuments,
      openDraftRequests,
      total: totalDrafts,
      limit: query.limit,
      offset: query.offset,
    });
  });
}

export { registerMeDocumentsRoutes };
