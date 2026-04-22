import type { PrismaClient } from '../../../../generated/prisma/client.js';
import {
  getContextIdsForScope,
  type ScopeRef,
} from '../../organisation/permissions/scopeResolution.js';
import { getScopeLead } from '../../organisation/permissions/scopeLead.js';
import { getWritableCatalogScope } from '../../organisation/permissions/catalogPermissions.js';
import type { MeTrashArchiveItem } from '../schemas/me.js';

export function contextNameFromDoc(doc: {
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

/** Use with document select (no mix of top-level include). */
export const trashArchiveContextSelect = {
  context: {
    select: {
      process: { select: { name: true } },
      project: { select: { name: true } },
      subcontext: { select: { name: true } },
    },
  },
} as const;

/**
 * Builds the list of trash or archive items for an org scope (company/department/team).
 * Personal scope is handled separately in the route.
 */
export async function getTrashOrArchiveItems(
  prisma: PrismaClient,
  userId: string,
  scopeRef: ScopeRef,
  mode: 'trash' | 'archive'
): Promise<{ items: MeTrashArchiveItem[] } | { items: []; emptyReason: 'no-access' }> {
  const [scopeContextIds, scopeLead, writable] = await Promise.all([
    getContextIdsForScope(prisma, scopeRef),
    getScopeLead(prisma, userId, scopeRef),
    getWritableCatalogScope(prisma, userId),
  ]);

  const isTrash = mode === 'trash';
  const writableCtxSet = new Set(writable.contextIds);
  const writableDocSet = new Set([
    ...writable.documentIdsFromGrants,
    ...(writable.documentIdsFromCreator ?? []),
  ]);

  const [procs, projs] =
    scopeRef.type === 'team'
      ? await Promise.all([
          prisma.process.findMany({
            where: isTrash
              ? { deletedAt: { not: null }, owner: { teamId: scopeRef.teamId } }
              : { archivedAt: { not: null }, deletedAt: null, owner: { teamId: scopeRef.teamId } },
            select: {
              id: true,
              name: true,
              contextId: true,
              deletedAt: true,
              archivedAt: true,
            },
          }),
          prisma.project.findMany({
            where: isTrash
              ? { deletedAt: { not: null }, owner: { teamId: scopeRef.teamId } }
              : { archivedAt: { not: null }, deletedAt: null, owner: { teamId: scopeRef.teamId } },
            select: {
              id: true,
              name: true,
              contextId: true,
              deletedAt: true,
              archivedAt: true,
            },
          }),
        ])
      : scopeContextIds.length > 0
        ? await Promise.all([
            prisma.process.findMany({
              where: isTrash
                ? { deletedAt: { not: null }, contextId: { in: scopeContextIds } }
                : {
                    archivedAt: { not: null },
                    deletedAt: null,
                    contextId: { in: scopeContextIds },
                  },
              select: {
                id: true,
                name: true,
                contextId: true,
                deletedAt: true,
                archivedAt: true,
              },
            }),
            prisma.project.findMany({
              where: isTrash
                ? { deletedAt: { not: null }, contextId: { in: scopeContextIds } }
                : {
                    archivedAt: { not: null },
                    deletedAt: null,
                    contextId: { in: scopeContextIds },
                  },
              select: {
                id: true,
                name: true,
                contextId: true,
                deletedAt: true,
                archivedAt: true,
              },
            }),
          ])
        : [[], []];

  const hasContextAccess =
    procs.some((p) => writableCtxSet.has(p.contextId)) ||
    projs.some((p) => writableCtxSet.has(p.contextId));
  const docIdsInScope =
    scopeContextIds.length > 0
      ? await prisma.document
          .findMany({
            where: isTrash
              ? { deletedAt: { not: null }, contextId: { in: scopeContextIds } }
              : {
                  deletedAt: null,
                  archivedAt: { not: null },
                  contextId: { in: scopeContextIds },
                },
            select: { id: true },
          })
          .then((r) => r.map((d) => d.id))
      : [];
  const hasDocAccess = scopeLead || docIdsInScope.some((id) => writableDocSet.has(id));
  if (!scopeLead && !hasContextAccess && !hasDocAccess) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[me/trash-archive] no-access', {
        scopeRef,
        scopeContextIdsLength: scopeContextIds.length,
        scopeLead,
        hasContextAccess,
        hasDocAccess,
      });
    }
    return { items: [], emptyReason: 'no-access' };
  }

  const items: MeTrashArchiveItem[] = [];

  for (const p of procs) {
    if (scopeLead || writableCtxSet.has(p.contextId)) {
      items.push({
        type: 'process',
        id: p.id,
        displayTitle: p.name,
        contextName: '-',
        ...(isTrash
          ? { deletedAt: p.deletedAt?.toISOString() ?? '' }
          : { archivedAt: p.archivedAt?.toISOString() ?? '' }),
      });
    }
  }
  for (const p of projs) {
    if (scopeLead || writableCtxSet.has(p.contextId)) {
      items.push({
        type: 'project',
        id: p.id,
        displayTitle: p.name,
        contextName: '-',
        ...(isTrash
          ? { deletedAt: p.deletedAt?.toISOString() ?? '' }
          : { archivedAt: p.archivedAt?.toISOString() ?? '' }),
      });
    }
  }

  const writableDocIds = [...writableDocSet];
  const orConditions = scopeLead
    ? [
        ...(scopeContextIds.length > 0 ? [{ contextId: { in: scopeContextIds } }] : []),
        { contextId: null, createdById: userId },
      ]
    : [
        ...(scopeContextIds.length > 0 ? [{ contextId: { in: scopeContextIds } }] : []),
        ...(writableDocIds.length > 0 ? [{ id: { in: writableDocIds } }] : []),
      ];
  const docOr = orConditions.length > 0 ? orConditions : [{ id: { in: [] as string[] } }];

  const docs = await prisma.document.findMany({
    where: isTrash
      ? {
          deletedAt: { not: null },
          OR: docOr,
        }
      : {
          deletedAt: null,
          archivedAt: { not: null },
          OR: docOr,
        },
    select: {
      id: true,
      title: true,
      contextId: true,
      deletedAt: true,
      archivedAt: true,
      ...trashArchiveContextSelect,
    },
  });
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[me/trash-archive] items', {
      scopeRef,
      scopeContextIdsLength: scopeContextIds.length,
      scopeLead,
      hasContextAccess,
      hasDocAccess,
      procsLength: procs.length,
      projsLength: projs.length,
      docsLength: docs.length,
      itemsLength: items.length + docs.length,
    });
  }
  for (const d of docs) {
    items.push({
      type: 'document',
      id: d.id,
      displayTitle: d.title,
      contextName: contextNameFromDoc(d),
      ...(isTrash
        ? { deletedAt: d.deletedAt?.toISOString() ?? '' }
        : { archivedAt: d.archivedAt?.toISOString() ?? '' }),
    });
  }
  return { items };
}
