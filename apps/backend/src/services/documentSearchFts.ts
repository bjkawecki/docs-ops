import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import type { SearchDocumentItem, SearchDocumentsArgs } from './documentSearchTypes.js';

type ReadableCatalogScope = { contextIds: string[]; documentIdsFromGrants: string[] };
type WritableCatalogScope = {
  contextIds: string[];
  documentIdsFromGrants: string[];
  documentIdsFromCreator: string[];
};

function buildPrefixTsQuery(term: string): string | null {
  const tokens = term
    .split(/\s+/)
    .map((part) => part.trim().toLowerCase())
    .map((part) => part.replace(/[^\p{L}\p{N}_-]/gu, ''))
    .filter((part) => part.length > 1);
  if (tokens.length === 0) return null;
  return tokens.map((token) => `${token}:*`).join(' & ');
}

/**
 * SQL WHERE fragments for FTS against `document_search_index` joined to `Document` as `d`.
 * Excludes the main text match / rank / snippet expressions (passed separately).
 */
export function buildFtsSearchWhereParts(
  args: SearchDocumentsArgs,
  readable: ReadableCatalogScope,
  writable: WritableCatalogScope
): { whereParts: Prisma.Sql[]; readableAccessEmpty: boolean } {
  const readableContextIds = [...new Set(readable.contextIds)];
  const readableGrantDocIds = [...new Set(readable.documentIdsFromGrants)];
  const writableContextIds = [...new Set(writable.contextIds)];
  const writableGrantDocIds = [...new Set(writable.documentIdsFromGrants)];
  const writableCreatorDocIds = [...new Set(writable.documentIdsFromCreator)];

  const readableAccessOr: Prisma.Sql[] = [];
  if (readableContextIds.length > 0) {
    readableAccessOr.push(Prisma.sql`d."contextId" IN (${Prisma.join(readableContextIds)})`);
  }
  if (readableGrantDocIds.length > 0) {
    readableAccessOr.push(Prisma.sql`d.id IN (${Prisma.join(readableGrantDocIds)})`);
  }
  if (writableCreatorDocIds.length > 0) {
    readableAccessOr.push(Prisma.sql`d.id IN (${Prisma.join(writableCreatorDocIds)})`);
  }
  if (readableAccessOr.length === 0) {
    return { whereParts: [], readableAccessEmpty: true };
  }

  const draftVisibleOr: Prisma.Sql[] = [Prisma.sql`d."publishedAt" IS NOT NULL`];
  if (writableContextIds.length > 0) {
    draftVisibleOr.push(Prisma.sql`d."contextId" IN (${Prisma.join(writableContextIds)})`);
  }
  if (writableGrantDocIds.length > 0) {
    draftVisibleOr.push(Prisma.sql`d.id IN (${Prisma.join(writableGrantDocIds)})`);
  }
  if (writableCreatorDocIds.length > 0) {
    draftVisibleOr.push(Prisma.sql`d.id IN (${Prisma.join(writableCreatorDocIds)})`);
  }

  const whereParts: Prisma.Sql[] = [
    Prisma.sql`d."deletedAt" IS NULL`,
    Prisma.sql`d."archivedAt" IS NULL`,
    Prisma.sql`(${Prisma.join(readableAccessOr, ' OR ')})`,
    Prisma.sql`(${Prisma.join(draftVisibleOr, ' OR ')})`,
    Prisma.sql`(
      d."contextId" IS NULL
      OR EXISTS (
        SELECT 1 FROM "Process" p
        WHERE p."contextId" = d."contextId"
          AND p."deletedAt" IS NULL
          AND p."archivedAt" IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM "Project" p
        WHERE p."contextId" = d."contextId"
          AND p."deletedAt" IS NULL
          AND p."archivedAt" IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM "Subcontext" s
        JOIN "Project" p ON p.id = s."projectId"
        WHERE s."contextId" = d."contextId"
          AND p."deletedAt" IS NULL
          AND p."archivedAt" IS NULL
      )
    )`,
  ];

  if (args.contextType === 'process') {
    whereParts.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "Process" p WHERE p."contextId" = d."contextId" AND p."deletedAt" IS NULL AND p."archivedAt" IS NULL)`
    );
  } else if (args.contextType === 'project') {
    whereParts.push(
      Prisma.sql`(
        EXISTS (SELECT 1 FROM "Project" p WHERE p."contextId" = d."contextId" AND p."deletedAt" IS NULL AND p."archivedAt" IS NULL)
        OR EXISTS (
          SELECT 1
          FROM "Subcontext" s
          JOIN "Project" p ON p.id = s."projectId"
          WHERE s."contextId" = d."contextId"
            AND p."deletedAt" IS NULL
            AND p."archivedAt" IS NULL
        )
      )`
    );
  }

  if (args.companyId) {
    whereParts.push(Prisma.sql`(
      EXISTS (
        SELECT 1
        FROM "Process" p
        JOIN "Owner" o ON o.id = p."ownerId"
        WHERE p."contextId" = d."contextId"
          AND o."companyId" = ${args.companyId}
      )
      OR EXISTS (
        SELECT 1
        FROM "Project" p
        JOIN "Owner" o ON o.id = p."ownerId"
        WHERE p."contextId" = d."contextId"
          AND o."companyId" = ${args.companyId}
      )
      OR EXISTS (
        SELECT 1
        FROM "Subcontext" s
        JOIN "Project" p ON p.id = s."projectId"
        JOIN "Owner" o ON o.id = p."ownerId"
        WHERE s."contextId" = d."contextId"
          AND o."companyId" = ${args.companyId}
      )
    )`);
  } else if (args.departmentId) {
    whereParts.push(Prisma.sql`(
      EXISTS (
        SELECT 1
        FROM "Process" p
        JOIN "Owner" o ON o.id = p."ownerId"
        WHERE p."contextId" = d."contextId"
          AND o."departmentId" = ${args.departmentId}
      )
      OR EXISTS (
        SELECT 1
        FROM "Project" p
        JOIN "Owner" o ON o.id = p."ownerId"
        WHERE p."contextId" = d."contextId"
          AND o."departmentId" = ${args.departmentId}
      )
      OR EXISTS (
        SELECT 1
        FROM "Subcontext" s
        JOIN "Project" p ON p.id = s."projectId"
        JOIN "Owner" o ON o.id = p."ownerId"
        WHERE s."contextId" = d."contextId"
          AND o."departmentId" = ${args.departmentId}
      )
    )`);
  } else if (args.teamId) {
    whereParts.push(Prisma.sql`(
      EXISTS (
        SELECT 1
        FROM "Process" p
        JOIN "Owner" o ON o.id = p."ownerId"
        WHERE p."contextId" = d."contextId"
          AND o."teamId" = ${args.teamId}
      )
      OR EXISTS (
        SELECT 1
        FROM "Project" p
        JOIN "Owner" o ON o.id = p."ownerId"
        WHERE p."contextId" = d."contextId"
          AND o."teamId" = ${args.teamId}
      )
      OR EXISTS (
        SELECT 1
        FROM "Subcontext" s
        JOIN "Project" p ON p.id = s."projectId"
        JOIN "Owner" o ON o.id = p."ownerId"
        WHERE s."contextId" = d."contextId"
          AND o."teamId" = ${args.teamId}
      )
    )`);
  }

  if ((args.tagIds?.length ?? 0) > 0) {
    whereParts.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM "DocumentTag" dt
        WHERE dt."documentId" = d.id
          AND dt."tagId" IN (${Prisma.join(args.tagIds ?? [])})
      )
    `);
  }

  if (args.publishedOnly) {
    whereParts.push(Prisma.sql`d."publishedAt" IS NOT NULL`);
  }

  return { whereParts, readableAccessEmpty: false };
}

export async function executeFtsDocumentSearch(
  prisma: PrismaClient,
  args: SearchDocumentsArgs,
  readable: ReadableCatalogScope,
  writable: WritableCatalogScope
): Promise<{ items: SearchDocumentItem[]; total: number; limit: number; offset: number }> {
  const prefixTsQuery = buildPrefixTsQuery(args.query);
  const searchMatchSql =
    prefixTsQuery != null
      ? Prisma.sql`(
          si.searchable @@ websearch_to_tsquery('simple', ${args.query})
          OR si.searchable @@ to_tsquery('simple', ${prefixTsQuery})
          OR similarity(lower(si.title), lower(${args.query})) >= 0.3
        )`
      : Prisma.sql`(
          si.searchable @@ websearch_to_tsquery('simple', ${args.query})
          OR similarity(lower(si.title), lower(${args.query})) >= 0.3
        )`;
  const rankSql =
    prefixTsQuery != null
      ? Prisma.sql`(
          ts_rank(si.searchable, websearch_to_tsquery('simple', ${args.query})) * 1.0
          + ts_rank(si.searchable, to_tsquery('simple', ${prefixTsQuery})) * 0.7
          + similarity(lower(si.title), lower(${args.query})) * 0.25
        )`
      : Prisma.sql`(
          ts_rank(si.searchable, websearch_to_tsquery('simple', ${args.query})) * 1.0
          + similarity(lower(si.title), lower(${args.query})) * 0.25
        )`;
  /** Headline on body text; empty when the match is title-only or content is empty. */
  const snippetFromContentSql =
    prefixTsQuery != null
      ? Prisma.sql`COALESCE(
          NULLIF(
            ts_headline(
              'simple',
              COALESCE(si.content, ''),
              websearch_to_tsquery('simple', ${args.query}),
              'StartSel=[[, StopSel=]], MaxFragments=2, MinWords=6, MaxWords=14'
            ),
            ''
          ),
          ts_headline(
            'simple',
            COALESCE(si.content, ''),
            to_tsquery('simple', ${prefixTsQuery}),
            'StartSel=[[, StopSel=]], MaxFragments=2, MinWords=6, MaxWords=14'
          )
        )`
      : Prisma.sql`ts_headline(
          'simple',
          COALESCE(si.content, ''),
          websearch_to_tsquery('simple', ${args.query}),
          'StartSel=[[, StopSel=]], MaxFragments=2, MinWords=6, MaxWords=14'
        )`;
  /** When content headline is empty but title matched (similarity / title terms), show title excerpt. */
  const snippetFromTitleSql = Prisma.sql`ts_headline(
    'simple',
    COALESCE(si.title, ''),
    websearch_to_tsquery('simple', ${args.query}),
    'StartSel=[[, StopSel=]], MaxFragments=2, MinWords=2, MaxWords=20'
  )`;
  const snippetSql = Prisma.sql`COALESCE(
    NULLIF(trim(${snippetFromContentSql}), ''),
    ${snippetFromTitleSql}
  )`;

  const { whereParts, readableAccessEmpty } = buildFtsSearchWhereParts(args, readable, writable);
  if (readableAccessEmpty) {
    return { items: [], total: 0, limit: args.limit, offset: args.offset };
  }

  const fullWhereParts: Prisma.Sql[] = [searchMatchSql, ...whereParts];
  const whereSql = Prisma.sql`WHERE ${Prisma.join(fullWhereParts, ' AND ')}`;

  const [countRows, rows] = await Promise.all([
    prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM document_search_index si
      JOIN "Document" d ON d.id = si.document_id
      LEFT JOIN "Context" c ON c.id = d."contextId"
      ${whereSql}
    `),
    prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        context_id: string | null;
        context_name: string | null;
        context_type: string | null;
        updated_at: Date;
        rank: number;
        snippet: string | null;
      }>
    >(Prisma.sql`
      SELECT
        d.id,
        d.title,
        d."contextId" AS context_id,
        c."displayName" AS context_name,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM "Subcontext" s WHERE s."contextId" = c.id
          ) THEN 'subcontext'
          ELSE c."contextType"
        END AS context_type,
        d."updatedAt" AS updated_at,
        ${rankSql} AS rank,
        ${snippetSql} AS snippet
      FROM document_search_index si
      JOIN "Document" d ON d.id = si.document_id
      LEFT JOIN "Context" c ON c.id = d."contextId"
      ${whereSql}
      ORDER BY rank DESC, d."updatedAt" DESC
      LIMIT ${args.limit}
      OFFSET ${args.offset}
    `),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      contextId: row.context_id,
      contextName: row.context_name,
      contextType: row.context_type as SearchDocumentItem['contextType'],
      updatedAt: row.updated_at,
      rank: row.rank,
      snippet: row.snippet,
    })),
    total: Number(countRows[0]?.total ?? 0n),
    limit: args.limit,
    offset: args.offset,
  };
}
