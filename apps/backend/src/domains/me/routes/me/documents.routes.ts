import type { FastifyInstance } from 'fastify';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../../auth/middleware.js';
import { canWriteInScope } from '../../../organisation/permissions/scopeLead.js';
import {
  meCanWriteInScopeQuerySchema,
  meDocumentsListQuerySchema,
  meDraftsQuerySchema,
} from '../../schemas/me.js';
import {
  getDraftsScope,
  getPersonalContextIds,
  getSharedDocumentIds,
  getScopeFromOwner,
  getWritableScope,
  listMeDocumentsPage,
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
      const query = meDocumentsListQuerySchema.parse(request.query);

      const personalContextIds = await getPersonalContextIds(prisma, userId);

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

      const { items, total } = await listMeDocumentsPage(prisma, where, query.limit, query.offset);
      return reply.send({ items, total, limit: query.limit, offset: query.offset });
    }
  );

  app.get('/me/shared-documents', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = meDocumentsListQuerySchema.parse(request.query);

    const documentIds = await getSharedDocumentIds(prisma, userId);
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

    const { items, total } = await listMeDocumentsPage(prisma, where, query.limit, query.offset);
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
