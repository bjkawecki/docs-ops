import type { FastifyInstance } from 'fastify';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../auth/middleware.js';
import {
  canReadContext,
  canWriteContext,
} from '../../organisation/permissions/contextPermissions.js';
import {
  getReadableCatalogScope,
  getWritableCatalogScope,
} from '../../organisation/permissions/catalogPermissions.js';
import { searchDocumentsForUser } from '../../search/services/documentSearchService.js';
import { buildCatalogDocumentListBase } from '../services/query/catalogDocumentListWhere.js';
import { findIndexedDocumentIds } from '../services/route-support/documentRouteSupport.js';
import {
  catalogDocumentsQuerySchema,
  contextIdParamSchema,
  paginationQuerySchema,
} from '../schemas/documents.js';

const ownerRefSelect = {
  company: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  ownerUserId: true,
  ownerUser: { select: { name: true } },
} as const;

const catalogContextSelect = {
  id: true,
  displayName: true,
  contextType: true,
  ownerDisplayName: true,
  process: {
    select: {
      id: true,
      name: true,
      owner: { select: ownerRefSelect },
    },
  },
  project: {
    select: {
      id: true,
      name: true,
      owner: { select: ownerRefSelect },
    },
  },
  subcontext: {
    select: {
      id: true,
      name: true,
      project: {
        select: {
          id: true,
          name: true,
          owner: { select: ownerRefSelect },
        },
      },
    },
  },
} as const;

const catalogDocumentSelect = {
  id: true,
  title: true,
  contextId: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  currentPublishedVersion: {
    select: {
      versionNumber: true,
    },
  },
  documentTags: { include: { tag: { select: { id: true, name: true } } } },
  context: { select: catalogContextSelect },
} as const;

function emptyCatalogResponse(
  limit: number,
  offset: number
): {
  items: [];
  total: number;
  limit: number;
  offset: number;
} {
  return { items: [], total: 0, limit, offset };
}

export const registerCatalogRoutes = (app: FastifyInstance): void => {
  /** GET Catalog: all documents the user can read, with filters and pagination. */
  app.get('/documents', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = catalogDocumentsQuerySchema.parse(request.query);

    const [readableScope, writableScope] = await Promise.all([
      getReadableCatalogScope(prisma, userId),
      getWritableCatalogScope(prisma, userId),
    ]);

    const catalogBase = buildCatalogDocumentListBase(readableScope, writableScope, userId, {
      contextType: query.contextType,
      companyId: query.companyId,
      departmentId: query.departmentId,
      teamId: query.teamId,
    });
    if (catalogBase == null) {
      return reply.send(emptyCatalogResponse(query.limit, query.offset));
    }
    const { baseAnd, baseWhere } = catalogBase;

    if (query.tagIds.length > 0) {
      baseWhere.documentTags = { some: { tagId: { in: query.tagIds } } };
    }
    let rankedSearchOrder: string[] | null = null;
    let rankedSearchTotal: number | null = null;
    let searchMetaById = new Map<string, { rank: number; snippet: string | null }>();
    const isRelevanceSort = query.sortBy === 'relevance';
    if (query.search?.trim()) {
      const term = query.search.trim();
      try {
        if (isRelevanceSort) {
          const searchResult = await searchDocumentsForUser(prisma, userId, {
            query: term,
            limit: query.limit,
            offset: query.offset,
            contextType: query.contextType,
            companyId: query.companyId,
            departmentId: query.departmentId,
            teamId: query.teamId,
            tagIds: query.tagIds,
            publishedOnly: query.publishedOnly,
          });
          rankedSearchOrder = searchResult.items.map((item) => item.id);
          rankedSearchTotal = searchResult.total;
          searchMetaById = new Map(
            searchResult.items.map((item) => [item.id, { rank: item.rank, snippet: item.snippet }])
          );
          if (rankedSearchOrder.length === 0) {
            return reply.send(emptyCatalogResponse(query.limit, query.offset));
          }
          baseAnd.push({ id: { in: rankedSearchOrder } });
        } else {
          const indexedIds = await findIndexedDocumentIds(prisma, term);
          if (indexedIds.length === 0) {
            return reply.send(emptyCatalogResponse(query.limit, query.offset));
          }
          baseAnd.push({ id: { in: indexedIds } });
        }
      } catch (error) {
        rankedSearchOrder = null;
        rankedSearchTotal = null;
        searchMetaById = new Map();
        request.log.warn(
          { error },
          'Search index unavailable, falling back to document content scan'
        );
        baseAnd.push({
          OR: [{ title: { contains: term, mode: 'insensitive' } }],
        });
      }
    }
    if (query.publishedOnly) {
      baseWhere.publishedAt = { not: null };
    }

    const sortBy = query.sortBy ?? 'updatedAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const orderBy =
      sortBy === 'contextName'
        ? { context: { displayName: sortOrder } }
        : sortBy === 'contextType'
          ? { context: { contextType: sortOrder } }
          : sortBy === 'ownerDisplay'
            ? { context: { ownerDisplayName: sortOrder } }
            : sortBy === 'relevance'
              ? { updatedAt: 'desc' as const }
              : ({ [sortBy]: sortOrder } as {
                  title?: 'asc' | 'desc';
                  updatedAt?: 'asc' | 'desc';
                  createdAt?: 'asc' | 'desc';
                });

    const fetchCatalogRows = (args?: { useOrderBy?: boolean; take?: number; skip?: number }) =>
      prisma.document.findMany({
        where: baseWhere,
        select: catalogDocumentSelect,
        ...(args?.useOrderBy ? { orderBy } : {}),
        ...(args?.take !== undefined ? { take: args.take } : {}),
        ...(args?.skip !== undefined ? { skip: args.skip } : {}),
      });

    let rawItems: Awaited<ReturnType<typeof fetchCatalogRows>> = [];
    let totalCount = 0;
    if (rankedSearchOrder != null) {
      rawItems = await fetchCatalogRows();
      const orderIndexById = new Map(rankedSearchOrder.map((id, index) => [id, index]));
      rawItems.sort(
        (a, b) =>
          (orderIndexById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (orderIndexById.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
      totalCount = rankedSearchTotal ?? rawItems.length;
    } else {
      const [normalItems, normalTotalCount] = await Promise.all([
        fetchCatalogRows({ useOrderBy: true, take: query.limit, skip: query.offset }),
        prisma.document.count({ where: baseWhere }),
      ]);
      rawItems = normalItems;
      totalCount = normalTotalCount;
    }

    type ScopeInfo = {
      scopeType: 'team' | 'department' | 'company' | 'personal';
      scopeId: string | null;
      scopeName: string;
    };
    const mapDoc = (doc: Awaited<ReturnType<typeof fetchCatalogRows>>[number]) => {
      const ctx = doc.context;
      let contextType: 'process' | 'project' | 'subcontext' = 'process';
      let contextName = '';
      let ownerDisplay = 'Personal';
      let ownerHref: string | null = null;
      let contextProcessId: string | null = null;
      let contextProjectId: string | null = null;
      let scopeInfo: ScopeInfo = { scopeType: 'personal', scopeId: null, scopeName: 'Personal' };
      const getOwnerFrom = (o: {
        company: { id: string; name: string } | null;
        department: { id: string; name: string } | null;
        team: { id: string; name: string } | null;
        ownerUserId: string | null;
        ownerUser: { name: string | null } | null;
      }) => {
        ownerDisplay =
          o.company?.name ??
          o.department?.name ??
          o.team?.name ??
          (o.ownerUserId != null ? (o.ownerUser?.name ?? 'Personal') : 'Personal');
        if (o.company != null) {
          ownerHref = '/company';
          scopeInfo = { scopeType: 'company', scopeId: o.company.id, scopeName: o.company.name };
        } else if (o.department != null) {
          ownerHref = `/department/${o.department.id}`;
          scopeInfo = {
            scopeType: 'department',
            scopeId: o.department.id,
            scopeName: o.department.name,
          };
        } else if (o.team != null) {
          ownerHref = `/team/${o.team.id}`;
          scopeInfo = { scopeType: 'team', scopeId: o.team.id, scopeName: o.team.name };
        } else if (o.ownerUserId != null) {
          ownerHref = '/personal';
          scopeInfo = {
            scopeType: 'personal',
            scopeId: null,
            scopeName: o.ownerUser?.name ?? 'Personal',
          };
        }
      };
      if (!ctx) {
        contextName = 'Ungrouped';
      } else {
        contextName = ctx.displayName ?? '';
        if (ctx.process) {
          contextType = 'process';
          if (!contextName) contextName = ctx.process.name;
          contextProcessId = ctx.process.id;
          getOwnerFrom(ctx.process.owner);
        } else if (ctx.project) {
          contextType = 'project';
          if (!contextName) contextName = ctx.project.name;
          contextProjectId = ctx.project.id;
          getOwnerFrom(ctx.project.owner);
        } else if (ctx.subcontext) {
          contextType = 'subcontext';
          if (!contextName) contextName = ctx.subcontext.name;
          contextProjectId = ctx.subcontext.project.id;
          getOwnerFrom(ctx.subcontext.project.owner);
        } else {
          if (ctx.contextType === 'process' || ctx.contextType === 'project') {
            contextType = ctx.contextType;
          }
          ownerDisplay = ctx.ownerDisplayName ?? 'Personal';
          scopeInfo = {
            scopeType: 'personal',
            scopeId: null,
            scopeName: ctx.ownerDisplayName ?? 'Personal',
          };
        }
      }
      return {
        id: doc.id,
        title: doc.title,
        contextId: doc.contextId,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        documentTags: doc.documentTags,
        contextType,
        contextName,
        ownerDisplay,
        ownerHref,
        contextProcessId,
        contextProjectId,
        currentPublishedVersionNumber:
          doc.publishedAt != null ? (doc.currentPublishedVersion?.versionNumber ?? null) : null,
        scopeType: scopeInfo.scopeType,
        scopeId: scopeInfo.scopeId,
        scopeName: scopeInfo.scopeName,
        searchRank: searchMetaById.get(doc.id)?.rank ?? null,
        searchSnippet: searchMetaById.get(doc.id)?.snippet ?? null,
      };
    };

    const items = rawItems.map(mapDoc);

    return reply.send({
      items,
      total: totalCount,
      limit: query.limit,
      offset: query.offset,
    });
  });

  /** GET Dokumente eines Kontexts – canReadContext, paginiert, ohne gelöschte. */
  app.get(
    '/contexts/:contextId/documents',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { contextId } = contextIdParamSchema.parse(request.params);
      const query = paginationQuerySchema.parse(request.query);

      const [readAllowed, writeAllowed] = await Promise.all([
        canReadContext(prisma, userId, contextId),
        canWriteContext(prisma, userId, contextId),
      ]);
      if (!readAllowed) return reply.status(403).send({ error: 'No access to this context' });

      /** Writers see all documents (drafts + published); readers only published, so published drafts appear under Documents. */
      const documentWhere = {
        contextId,
        deletedAt: null,
        archivedAt: null,
        ...(writeAllowed ? {} : { publishedAt: { not: null } }),
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
        prisma.document.count({ where: documentWhere }),
      ]);
      return reply.send({ items, total, limit: query.limit, offset: query.offset });
    }
  );
};
