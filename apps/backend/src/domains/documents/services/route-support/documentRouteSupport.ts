import { Prisma, type PrismaClient } from '../../../../../generated/prisma/client.js';
import {
  chunkUserIdsForNotificationJobs,
  symmetricDiffUserIds,
} from '../../../notifications/services/notificationRecipients.js';
import { enqueueJob } from '../../../../infrastructure/jobs/client.js';
import type { DocumentMetadataUpdateResult } from '../lifecycle/documentService.js';
import { parseBlockDocumentFromDb } from '../blocks/documentBlocksBackfill.js';
import { documentMarkdownFromRow } from '../query/documentMarkdownSnapshot.js';

export function buildPdfDownloadFilename(
  title: string | null | undefined,
  documentId: string
): string {
  const raw = (title?.trim() || `document-${documentId}`).toLowerCase();
  const normalized = raw
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const base = normalized || `document-${documentId}`;
  return base.endsWith('.pdf') ? base : `${base}.pdf`;
}

export async function enqueueIncrementalReindexForDocument(args: {
  documentId: string;
  contextId?: string | null;
  trigger: 'document-created' | 'document-updated' | 'document-deleted' | 'manual';
}): Promise<void> {
  await enqueueJob('search.reindex.incremental', {
    documentId: args.documentId,
    contextId: args.contextId ?? undefined,
    trigger: args.trigger,
  });
}

/** Wie `enqueueIncrementalReindexForDocument`, Fehler nur loggen (gleiche Warn-Messages wie in den Routen). */
export async function enqueueIncrementalReindexForDocumentSafe(
  log: { warn: (meta: Record<string, unknown>, msg: string) => void },
  params: {
    documentId: string;
    contextId?: string | null;
    trigger: 'document-created' | 'document-updated' | 'document-deleted' | 'manual';
    warnMessage: string;
  }
): Promise<void> {
  try {
    await enqueueIncrementalReindexForDocument({
      documentId: params.documentId,
      contextId: params.contextId,
      trigger: params.trigger,
    });
  } catch (error: unknown) {
    log.warn({ error, documentId: params.documentId }, params.warnMessage);
  }
}

export async function enqueueNotificationEvent(args: {
  eventType: string;
  targetUserIds: string[];
  payload: Record<string, unknown>;
}): Promise<void> {
  const chunks =
    args.targetUserIds.length === 0 ? [] : chunkUserIdsForNotificationJobs(args.targetUserIds);
  for (const targetUserIds of chunks) {
    await enqueueJob('notifications.send', {
      eventType: args.eventType,
      targetUserIds,
      payload: args.payload,
    });
  }
}

function sortedTagIdsSignature(tags: readonly { tagId?: string; tag?: { id: string } }[]): string {
  const ids = tags
    .map((t) => t.tag?.id ?? t.tagId)
    .filter((id): id is string => id != null && id !== '');
  return [...new Set(ids)].sort().join(',');
}

export type DocumentMetadataPatch = {
  title?: string;
  description?: string | null;
  contextId?: string | null;
  tagIds?: string[];
};

export function patchTouchesReaderVisibleFields(body: DocumentMetadataPatch): boolean {
  return (
    body.title !== undefined ||
    body.description !== undefined ||
    body.contextId !== undefined ||
    body.tagIds !== undefined
  );
}

export function readerVisibleContentChanged(args: {
  before: {
    title: string;
    description: string | null;
    contextId: string | null;
    documentTags: { tagId: string }[];
  };
  body: DocumentMetadataPatch;
  after: DocumentMetadataUpdateResult;
}): boolean {
  const { before, body, after } = args;
  if (body.title !== undefined && body.title !== before.title) return true;
  if (body.description !== undefined && (before.description ?? null) !== (body.description ?? null))
    return true;
  if (body.contextId !== undefined && (before.contextId ?? null) !== (body.contextId ?? null))
    return true;
  if (body.tagIds !== undefined) {
    const beforeSig = sortedTagIdsSignature(before.documentTags);
    const afterSig = sortedTagIdsSignature(after.documentTags.map((dt) => ({ tag: dt.tag })));
    if (beforeSig !== afterSig) return true;
  }
  return false;
}

export async function findIndexedDocumentIds(
  prisma: PrismaClient,
  term: string
): Promise<string[]> {
  const prefixTokens = term
    .split(/\s+/)
    .map((part) => part.trim().toLowerCase())
    .map((part) => part.replace(/[^\p{L}\p{N}_-]/gu, ''))
    .filter((part) => part.length > 1);
  const prefixTsQuery =
    prefixTokens.length > 0 ? prefixTokens.map((token) => `${token}:*`).join(' & ') : null;

  const rows = await prisma.$queryRaw<Array<{ document_id: string }>>(Prisma.sql`
    SELECT document_id
    FROM document_search_index
    WHERE
      searchable @@ websearch_to_tsquery('simple', ${term})
      OR (${prefixTsQuery != null ? Prisma.sql`searchable @@ to_tsquery('simple', ${prefixTsQuery})` : Prisma.sql`FALSE`})
      OR similarity(lower(title), lower(${term})) >= 0.3
    LIMIT 5000
  `);
  return rows.map((row) => row.document_id);
}

export function changedUserIdsFromBeforeAfter(args: {
  before: Set<string>;
  afterRead: string[];
  afterWrite: string[];
}) {
  const afterUnion = new Set<string>([...args.afterRead, ...args.afterWrite]);
  return symmetricDiffUserIds(args.before, afterUnion);
}

type DocumentDetailShape = {
  id: string;
  title: string;
  draftRevision: number;
  draftBlocks: unknown;
  pdfUrl: string | null;
  contextId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  publishedAt: Date | null;
  currentPublishedVersionId: string | null;
  description: string | null;
  createdById: string | null;
  createdBy: { name: string } | null;
  documentTags: unknown;
  context: {
    process?: {
      id: string;
      name: string;
      owner: {
        id: string;
        displayName: string | null;
        ownerUserId: string | null;
        companyId: string | null;
        departmentId: string | null;
        teamId: string | null;
      };
    } | null;
    project?: {
      id: string;
      name: string;
      owner: {
        id: string;
        displayName: string | null;
        ownerUserId: string | null;
        companyId: string | null;
        departmentId: string | null;
        teamId: string | null;
      };
    } | null;
    subcontext?: {
      id: string;
      name: string;
      project: {
        id: string;
        name: string;
        owner: {
          id: string;
          displayName: string | null;
          ownerUserId: string | null;
          companyId: string | null;
          departmentId: string | null;
          teamId: string | null;
        };
      };
    } | null;
  } | null;
  currentPublishedVersion: {
    versionNumber: number;
    blocks: unknown;
    blocksSchemaVersion: number | null;
  } | null;
  grantUser: Array<{ userId: string; role: string; user: { name: string } }>;
  grantTeam: Array<{ teamId: string; role: string; team: { name: string } }>;
  grantDepartment: Array<{ departmentId: string; role: string; department: { name: string } }>;
};

export function buildDocumentDetailResponse(args: {
  doc: DocumentDetailShape;
  writeAllowed: boolean;
  deleteAllowed: boolean;
  canPublish: boolean;
  canModerateComments: boolean;
}) {
  const { doc } = args;
  const ctx = doc.context;
  const owner =
    ctx?.process?.owner ?? ctx?.project?.owner ?? ctx?.subcontext?.project?.owner ?? null;
  const contextOwnerId = owner?.id ?? null;
  const scope =
    owner?.ownerUserId != null
      ? { type: 'personal' as const, name: owner.displayName ?? 'Personal' }
      : owner?.companyId != null
        ? { type: 'company' as const, id: owner.companyId, name: owner.displayName ?? 'Company' }
        : owner?.departmentId != null
          ? {
              type: 'department' as const,
              id: owner.departmentId,
              name: owner.displayName ?? 'Department',
            }
          : owner?.teamId != null
            ? { type: 'team' as const, id: owner.teamId, name: owner.displayName ?? 'Team' }
            : null;

  let contextType: 'process' | 'project' | 'subcontext' = 'process';
  let contextName = '';
  let contextProcessId: string | null = null;
  let contextProjectId: string | null = null;
  let contextProjectName: string | null = null;
  let subcontextId: string | null = null;
  let subcontextName: string | null = null;
  if (!ctx) {
    contextName = 'Ungrouped';
  } else if (ctx.process) {
    contextType = 'process';
    contextName = ctx.process.name;
    contextProcessId = ctx.process.id;
  } else if (ctx.project) {
    contextType = 'project';
    contextName = ctx.project.name;
    contextProjectId = ctx.project.id;
  } else if (ctx.subcontext) {
    contextType = 'subcontext';
    contextName = ctx.subcontext.name;
    contextProjectId = ctx.subcontext.project.id;
    contextProjectName = ctx.subcontext.project.name;
    subcontextId = ctx.subcontext.id;
    subcontextName = ctx.subcontext.name;
  }

  const writers = {
    users: doc.grantUser
      .filter((g) => g.role === 'Write')
      .map((g) => ({ userId: g.userId, name: g.user.name })),
    teams: doc.grantTeam
      .filter((g) => g.role === 'Write')
      .map((g) => ({ teamId: g.teamId, name: g.team.name })),
    departments: doc.grantDepartment
      .filter((g) => g.role === 'Write')
      .map((g) => ({ departmentId: g.departmentId, name: g.department.name })),
  };

  return {
    id: doc.id,
    title: doc.title,
    content: documentMarkdownFromRow({
      publishedAt: doc.publishedAt,
      draftBlocks: doc.draftBlocks,
      currentPublishedVersion: doc.currentPublishedVersion,
    }),
    draftRevision: doc.draftRevision,
    blocks: parseBlockDocumentFromDb(doc.draftBlocks),
    publishedBlocks: parseBlockDocumentFromDb(doc.currentPublishedVersion?.blocks ?? null),
    publishedBlocksSchemaVersion: doc.currentPublishedVersion?.blocksSchemaVersion ?? null,
    pdfUrl: doc.pdfUrl,
    contextId: doc.contextId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    deletedAt: doc.deletedAt?.toISOString() ?? null,
    publishedAt: doc.publishedAt,
    currentPublishedVersionId: doc.currentPublishedVersionId ?? null,
    currentPublishedVersionNumber:
      doc.publishedAt != null ? (doc.currentPublishedVersion?.versionNumber ?? null) : null,
    description: doc.description,
    createdById: doc.createdById,
    createdByName: doc.createdBy?.name ?? null,
    writers,
    documentTags: doc.documentTags,
    canWrite: args.writeAllowed,
    canDelete: args.deleteAllowed,
    canPublish: args.canPublish,
    canModerateComments: args.canModerateComments,
    scope,
    contextOwnerId,
    contextType,
    contextName,
    contextProcessId,
    contextProjectId,
    contextProjectName,
    subcontextId,
    subcontextName,
  };
}
