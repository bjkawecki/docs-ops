import type { Prisma } from '../../../generated/prisma/client.js';

/** Subset of catalog / search filters that shape the shared readable + context `where` clause. */
export type CatalogListScopeFilter = {
  contextType?: 'process' | 'project';
  companyId?: string;
  departmentId?: string;
  teamId?: string;
};

type ReadableScope = { contextIds: string[]; documentIdsFromGrants: string[] };
type WritableScope = {
  contextIds: string[];
  documentIdsFromGrants: string[];
  documentIdsFromCreator: string[];
};

/**
 * Base `where` for catalog document listing (readable + draft visibility + context filters),
 * before search / tag / publishedOnly clauses. Mutate the returned `baseAnd` to append filters.
 *
 * @returns `null` when the user cannot read any catalog documents.
 */
export function buildCatalogDocumentListBase(
  readableScope: ReadableScope,
  writableScope: WritableScope,
  userId: string,
  filter: CatalogListScopeFilter
): { baseAnd: Prisma.DocumentWhereInput[]; baseWhere: Prisma.DocumentWhereInput } | null {
  const { contextIds, documentIdsFromGrants } = readableScope;
  const {
    contextIds: writableContextIds,
    documentIdsFromGrants: writableDocumentIdsFromGrants,
    documentIdsFromCreator: writableDocumentIdsFromCreator,
  } = writableScope;

  const readableOr: Prisma.DocumentWhereInput[] = [];
  if (contextIds.length > 0) {
    readableOr.push({ contextId: { in: contextIds } });
  }
  if (documentIdsFromGrants.length > 0) {
    readableOr.push({ id: { in: documentIdsFromGrants } });
  }
  if (writableDocumentIdsFromCreator.length > 0) {
    readableOr.push({ id: { in: writableDocumentIdsFromCreator } });
  }
  if (readableOr.length === 0) {
    return null;
  }

  const draftVisibleOr: Prisma.DocumentWhereInput[] = [{ publishedAt: { not: null } }];
  if (writableContextIds.length > 0) {
    draftVisibleOr.push({ contextId: { in: writableContextIds } });
  }
  if (writableDocumentIdsFromGrants.length > 0) {
    draftVisibleOr.push({ id: { in: writableDocumentIdsFromGrants } });
  }
  if (writableDocumentIdsFromCreator.length > 0) {
    draftVisibleOr.push({ id: { in: writableDocumentIdsFromCreator } });
  }

  const scopeFilter = filter.companyId ?? filter.departmentId ?? filter.teamId;
  const contextConditions: Prisma.ContextWhereInput[] = [];
  if (filter.contextType === 'process') {
    contextConditions.push({ process: { isNot: null } });
  } else if (filter.contextType === 'project') {
    contextConditions.push({
      OR: [{ project: { isNot: null } }, { subcontext: { isNot: null } }],
    });
  }
  if (filter.companyId) {
    contextConditions.push({
      OR: [
        { process: { owner: { companyId: filter.companyId } } },
        { project: { owner: { companyId: filter.companyId } } },
        { subcontext: { project: { owner: { companyId: filter.companyId } } } },
      ],
    });
  } else if (filter.departmentId) {
    contextConditions.push({
      OR: [
        { process: { owner: { departmentId: filter.departmentId } } },
        { project: { owner: { departmentId: filter.departmentId } } },
        { subcontext: { project: { owner: { departmentId: filter.departmentId } } } },
      ],
    });
  } else if (filter.teamId) {
    contextConditions.push({
      OR: [
        { process: { owner: { teamId: filter.teamId } } },
        { project: { owner: { teamId: filter.teamId } } },
        { subcontext: { project: { owner: { teamId: filter.teamId } } } },
      ],
    });
  }

  const scopeContextCond: Prisma.ContextWhereInput =
    contextConditions.length === 1 ? contextConditions[0] : { AND: contextConditions };

  const contextNotDeletedCond: Prisma.DocumentWhereInput = {
    OR: [
      { contextId: null },
      {
        context: {
          OR: [
            { process: { deletedAt: null } },
            { project: { deletedAt: null } },
            { subcontext: { project: { deletedAt: null } } },
          ],
        },
      },
    ],
  };

  const baseAnd: Prisma.DocumentWhereInput[] = [
    { OR: readableOr },
    contextNotDeletedCond,
    ...(scopeFilter != null
      ? [
          {
            OR: [
              { publishedAt: { not: null }, context: scopeContextCond },
              { contextId: null, createdById: userId },
            ],
          },
        ]
      : [{ OR: draftVisibleOr }]),
  ];

  const baseWhere: Prisma.DocumentWhereInput = {
    deletedAt: null,
    archivedAt: null,
    AND: baseAnd,
  };

  if (contextConditions.length > 0 && scopeFilter == null) {
    baseWhere.context = scopeContextCond;
  }

  return { baseAnd, baseWhere };
}
