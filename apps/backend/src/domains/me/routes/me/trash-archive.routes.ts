import type { FastifyInstance, FastifyReply } from 'fastify';
import type { PrismaClient } from '../../../../../generated/prisma/client.js';
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

function personalDocumentOwnerOr(userId: string) {
  return [
    { context: { process: { owner: { ownerUserId: userId } } } },
    { context: { project: { owner: { ownerUserId: userId } } } },
    { context: { subcontext: { project: { owner: { ownerUserId: userId } } } } },
    { contextId: null, createdById: userId },
  ];
}

function orgScopeRefFromMeOrgQuery(query: {
  scope: 'company' | 'department' | 'team';
  companyId?: string;
  departmentId?: string;
  teamId?: string;
}): ScopeRef {
  if (query.scope === 'company') return { type: 'company', companyId: query.companyId! };
  if (query.scope === 'department')
    return { type: 'department', departmentId: query.departmentId! };
  return { type: 'team', teamId: query.teamId! };
}

async function appendPersonalTrashItems(
  prisma: PrismaClient,
  userId: string,
  target: MeTrashArchiveItem[]
): Promise<void> {
  const ownerOr = personalDocumentOwnerOr(userId);
  const [docs, processes, projects] = await Promise.all([
    prisma.document.findMany({
      where: { deletedAt: { not: null }, OR: ownerOr },
      select: { id: true, title: true, deletedAt: true, ...trashArchiveContextSelect },
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

  for (const doc of docs) {
    target.push({
      type: 'document',
      id: doc.id,
      displayTitle: doc.title,
      contextName: contextNameFromDoc(doc),
      deletedAt: doc.deletedAt?.toISOString() ?? '',
    });
  }
  for (const process of processes) {
    target.push({
      type: 'process',
      id: process.id,
      displayTitle: process.name,
      contextName: '-',
      deletedAt: process.deletedAt?.toISOString() ?? '',
    });
  }
  for (const project of projects) {
    target.push({
      type: 'project',
      id: project.id,
      displayTitle: project.name,
      contextName: '-',
      deletedAt: project.deletedAt?.toISOString() ?? '',
    });
  }
}

async function appendPersonalArchiveItems(
  prisma: PrismaClient,
  userId: string,
  target: MeTrashArchiveItem[]
): Promise<void> {
  const ownerOr = personalDocumentOwnerOr(userId);
  const [docs, processes, projects] = await Promise.all([
    prisma.document.findMany({
      where: { deletedAt: null, archivedAt: { not: null }, OR: ownerOr },
      select: { id: true, title: true, archivedAt: true, ...trashArchiveContextSelect },
    }),
    prisma.process.findMany({
      where: { archivedAt: { not: null }, deletedAt: null, owner: { ownerUserId: userId } },
      select: { id: true, name: true, archivedAt: true },
    }),
    prisma.project.findMany({
      where: { archivedAt: { not: null }, deletedAt: null, owner: { ownerUserId: userId } },
      select: { id: true, name: true, archivedAt: true },
    }),
  ]);

  for (const doc of docs) {
    target.push({
      type: 'document',
      id: doc.id,
      displayTitle: doc.title,
      contextName: contextNameFromDoc(doc),
      archivedAt: doc.archivedAt?.toISOString() ?? '',
    });
  }
  for (const process of processes) {
    target.push({
      type: 'process',
      id: process.id,
      displayTitle: process.name,
      contextName: '-',
      archivedAt: process.archivedAt?.toISOString() ?? '',
    });
  }
  for (const project of projects) {
    target.push({
      type: 'project',
      id: project.id,
      displayTitle: project.name,
      contextName: '-',
      archivedAt: project.archivedAt?.toISOString() ?? '',
    });
  }
}

function sortMeTrashArchiveItems(
  allItems: MeTrashArchiveItem[],
  options: {
    sortByTitle: boolean;
    sortOrder: 'asc' | 'desc';
    dateField: 'deletedAt' | 'archivedAt';
  }
): void {
  const { sortByTitle, sortOrder, dateField } = options;
  const sortVal = (item: MeTrashArchiveItem) =>
    sortByTitle ? (item.displayTitle ?? '').toLowerCase() : (item[dateField] ?? '');
  allItems.sort((left, right) => {
    const a = sortVal(left);
    const b = sortVal(right);
    const cmp = a < b ? -1 : a > b ? 1 : 0;
    return sortOrder === 'asc' ? cmp : -cmp;
  });
}

function sendEmptyMeTrashArchivePage(
  reply: FastifyReply,
  query: { limit: number; offset: number }
) {
  return reply.send({ items: [], total: 0, limit: query.limit, offset: query.offset });
}

function sendMeTrashArchivePage(
  reply: FastifyReply,
  allItems: MeTrashArchiveItem[],
  query: {
    type?: MeTrashArchiveItem['type'];
    limit: number;
    offset: number;
    sortOrder: 'asc' | 'desc';
  },
  sortOptions: { sortByTitle: boolean; dateField: 'deletedAt' | 'archivedAt' }
) {
  sortMeTrashArchiveItems(allItems, { ...sortOptions, sortOrder: query.sortOrder });
  const filtered =
    query.type != null ? allItems.filter((item) => item.type === query.type) : allItems;
  const total = filtered.length;
  const items = filtered.slice(query.offset, query.offset + query.limit);
  return reply.send({ items, total, limit: query.limit, offset: query.offset });
}

function registerMeTrashArchiveRoutes(app: FastifyInstance): void {
  app.get('/me/trash', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = meTrashQuerySchema.parse(request.query);

    const allItems: MeTrashArchiveItem[] = [];

    if (query.scope === 'personal') {
      await appendPersonalTrashItems(prisma, userId, allItems);
    } else {
      const scopeRef = orgScopeRefFromMeOrgQuery(query);
      const result = await getTrashOrArchiveItems(prisma, userId, scopeRef, 'trash');
      if ('emptyReason' in result) {
        return sendEmptyMeTrashArchivePage(reply, query);
      }
      allItems.push(...result.items);
    }

    return sendMeTrashArchivePage(reply, allItems, query, {
      sortByTitle: query.sortBy === 'title',
      dateField: 'deletedAt',
    });
  });

  app.get('/me/archive', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = meArchiveQuerySchema.parse(request.query);

    const allItems: MeTrashArchiveItem[] = [];

    if (query.scope === 'personal') {
      await appendPersonalArchiveItems(prisma, userId, allItems);
    } else {
      const scopeRef = orgScopeRefFromMeOrgQuery(query);
      const result = await getTrashOrArchiveItems(prisma, userId, scopeRef, 'archive');
      if ('emptyReason' in result) {
        return sendEmptyMeTrashArchivePage(reply, query);
      }
      allItems.push(...result.items);
    }

    return sendMeTrashArchivePage(reply, allItems, query, {
      sortByTitle: query.sortBy === 'title',
      dateField: 'archivedAt',
    });
  });
}

export { registerMeTrashArchiveRoutes };
