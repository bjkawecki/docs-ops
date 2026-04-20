import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  getReadableCatalogScope,
  getWritableCatalogScope,
} from '../permissions/catalogPermissions.js';
import { buildCatalogDocumentListBase } from './catalogDocumentListWhere.js';
import type { SearchDocumentItem, SearchDocumentsArgs } from './documentSearchTypes.js';

/** Plain-text excerpt with `[[match]]` markers for the same `renderSearchSnippet` UI as FTS. */
function excerptWithMarkers(source: string, term: string): string | null {
  const needle = term.trim();
  if (needle.length === 0) return null;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'i');
  const m = re.exec(source);
  if (m == null || m.index === undefined) return null;
  const i = m.index;
  const start = Math.max(0, i - 40);
  const frag = source.slice(start, start + 160);
  const marked = frag.replace(re, (x) => `[[${x}]]`);
  return start > 0 ? `…${marked}` : marked;
}

/**
 * Same text match as GET /documents when the search index query fails: `title` / `content`
 * `contains` with catalog-readable and draft-visibility rules.
 */
export async function searchDocumentsByContainsFallback(
  prisma: PrismaClient,
  userId: string,
  args: SearchDocumentsArgs
): Promise<{ items: SearchDocumentItem[]; total: number; limit: number; offset: number }> {
  const term = args.query.trim();
  const [readableScope, writableScope] = await Promise.all([
    getReadableCatalogScope(prisma, userId),
    getWritableCatalogScope(prisma, userId),
  ]);

  const catalogBase = buildCatalogDocumentListBase(readableScope, writableScope, userId, {
    contextType: args.contextType,
    companyId: args.companyId,
    departmentId: args.departmentId,
    teamId: args.teamId,
  });
  if (catalogBase == null) {
    return { items: [], total: 0, limit: args.limit, offset: args.offset };
  }

  const { baseAnd, baseWhere } = catalogBase;
  baseAnd.push({
    OR: [
      { title: { contains: term, mode: 'insensitive' } },
      { content: { contains: term, mode: 'insensitive' } },
    ],
  });

  if ((args.tagIds?.length ?? 0) > 0) {
    baseWhere.documentTags = { some: { tagId: { in: args.tagIds ?? [] } } };
  }
  if (args.publishedOnly) {
    baseWhere.publishedAt = { not: null };
  }

  const [total, rows] = await Promise.all([
    prisma.document.count({ where: baseWhere }),
    prisma.document.findMany({
      where: baseWhere,
      select: {
        id: true,
        title: true,
        content: true,
        contextId: true,
        updatedAt: true,
        context: {
          select: {
            displayName: true,
            contextType: true,
            subcontext: { select: { id: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: args.limit,
      skip: args.offset,
    }),
  ]);

  const items: SearchDocumentItem[] = rows.map((row) => {
    const fromBody = excerptWithMarkers(row.content ?? '', term);
    const fromTitle = fromBody == null ? excerptWithMarkers(row.title ?? '', term) : null;
    const snippet = fromBody ?? fromTitle;
    return {
      id: row.id,
      title: row.title,
      contextId: row.contextId,
      contextName: row.context?.displayName ?? null,
      contextType: row.context?.subcontext
        ? 'subcontext'
        : ((row.context?.contextType ?? null) as SearchDocumentItem['contextType']),
      updatedAt: row.updatedAt,
      rank: 0,
      snippet,
    };
  });

  return { items, total, limit: args.limit, offset: args.offset };
}
