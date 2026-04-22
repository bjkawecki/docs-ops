import type { FastifyInstance } from 'fastify';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../../auth/middleware.js';
import {
  contextNameFromDoc,
  getTrashOrArchiveItems,
  trashArchiveContextSelect,
} from '../meTrashArchive.js';
import { meArchiveQuerySchema, meTrashQuerySchema } from '../../schemas/me.js';
import type { ScopeRef } from '../../../organisation/permissions/scopeResolution.js';
import type { MeTrashArchiveItem } from './route-types.js';

function registerMeTrashArchiveRoutes(app: FastifyInstance): void {
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
      for (const doc of trashedDocs) {
        allItems.push({
          type: 'document',
          id: doc.id,
          displayTitle: doc.title,
          contextName: contextNameFromDoc(doc),
          deletedAt: doc.deletedAt?.toISOString() ?? '',
        });
      }
      for (const process of trashedProcesses) {
        allItems.push({
          type: 'process',
          id: process.id,
          displayTitle: process.name,
          contextName: '-',
          deletedAt: process.deletedAt?.toISOString() ?? '',
        });
      }
      for (const project of trashedProjects) {
        allItems.push({
          type: 'project',
          id: project.id,
          displayTitle: project.name,
          contextName: '-',
          deletedAt: project.deletedAt?.toISOString() ?? '',
        });
      }
    } else {
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
    const sortVal = (item: MeTrashArchiveItem) =>
      sortKey === 'displayTitle' ? (item.displayTitle ?? '').toLowerCase() : (item.deletedAt ?? '');
    allItems.sort((left, right) => {
      const a = sortVal(left);
      const b = sortVal(right);
      const cmp = a < b ? -1 : a > b ? 1 : 0;
      return query.sortOrder === 'asc' ? cmp : -cmp;
    });
    const filtered =
      query.type != null ? allItems.filter((item) => item.type === query.type) : allItems;
    const total = filtered.length;
    const items = filtered.slice(query.offset, query.offset + query.limit);
    return reply.send({ items, total, limit: query.limit, offset: query.offset });
  });

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
      for (const doc of archivedDocs) {
        allItems.push({
          type: 'document',
          id: doc.id,
          displayTitle: doc.title,
          contextName: contextNameFromDoc(doc),
          archivedAt: doc.archivedAt?.toISOString() ?? '',
        });
      }
      for (const process of archivedProcesses) {
        allItems.push({
          type: 'process',
          id: process.id,
          displayTitle: process.name,
          contextName: '-',
          archivedAt: process.archivedAt?.toISOString() ?? '',
        });
      }
      for (const project of archivedProjects) {
        allItems.push({
          type: 'project',
          id: project.id,
          displayTitle: project.name,
          contextName: '-',
          archivedAt: project.archivedAt?.toISOString() ?? '',
        });
      }
    } else {
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
    const sortVal = (item: MeTrashArchiveItem) =>
      sortKey === 'displayTitle'
        ? (item.displayTitle ?? '').toLowerCase()
        : (item.archivedAt ?? '');
    allItems.sort((left, right) => {
      const a = sortVal(left);
      const b = sortVal(right);
      const cmp = a < b ? -1 : a > b ? 1 : 0;
      return query.sortOrder === 'asc' ? cmp : -cmp;
    });
    const filtered =
      query.type != null ? allItems.filter((item) => item.type === query.type) : allItems;
    const total = filtered.length;
    const items = filtered.slice(query.offset, query.offset + query.limit);
    return reply.send({ items, total, limit: query.limit, offset: query.offset });
  });
}

export { registerMeTrashArchiveRoutes };
