import { Prisma } from '../../../../../generated/prisma/client.js';
import type { PrismaClient } from '../../../../../generated/prisma/client.js';
import {
  getReadableCatalogScope,
  getWritableCatalogScope,
} from '../../../organisation/permissions/catalogPermissions.js';
import type { ScopeRef } from '../../../organisation/permissions/scopeResolution.js';
import type {
  MeDraftsQuery,
  MeNotificationDbRow,
  OwnerScopeRow,
  UserPreferences,
} from './route-types.js';

const DOCUMENT_NOTIFICATION_EVENT_TYPES = [
  'document-created',
  'document-updated',
  'document-published',
  'document-archived',
  'document-deleted',
  'document-restored',
  'document-grants-changed',
  'document-comment-created',
] as const;

const REVIEW_NOTIFICATION_EVENT_TYPES = [
  'draft-request-submitted',
  'draft-request-merged',
  'draft-request-rejected',
] as const;

const ownerScopeSelect = {
  teamId: true,
  departmentId: true,
  companyId: true,
  ownerUserId: true,
  displayName: true,
} as const;

function notificationPayloadAsRecord(payload: unknown): Record<string, unknown> {
  if (payload != null && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

async function enrichMeNotificationItems(
  prisma: PrismaClient,
  rows: MeNotificationDbRow[]
): Promise<
  Array<{
    id: string;
    eventType: string;
    payload: unknown;
    createdAt: Date;
    readAt: Date | null;
    documentTitle: string | null;
  }>
> {
  const documentIds = new Set<string>();
  for (const row of rows) {
    const payload = notificationPayloadAsRecord(row.payload);
    const docId = typeof payload.documentId === 'string' ? payload.documentId : null;
    if (docId) documentIds.add(docId);
  }
  const ids = [...documentIds];
  const documents =
    ids.length > 0
      ? await prisma.document.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true },
        })
      : [];
  const titleById = new Map(documents.map((doc) => [doc.id, doc.title]));
  return rows.map((row) => {
    const payload = notificationPayloadAsRecord(row.payload);
    const documentId = typeof payload.documentId === 'string' ? payload.documentId : null;
    return {
      id: row.id,
      eventType: row.event_type,
      payload: row.payload,
      createdAt: row.created_at,
      readAt: row.read_at,
      documentTitle: documentId != null ? (titleById.get(documentId) ?? null) : null,
    };
  });
}

function notificationsCategorySql(category: string): Prisma.Sql {
  if (category === 'all') return Prisma.empty;
  if (category === 'documents') {
    return Prisma.sql`AND event_type IN (${Prisma.join([...DOCUMENT_NOTIFICATION_EVENT_TYPES])})`;
  }
  if (category === 'reviews') {
    return Prisma.sql`AND event_type IN (${Prisma.join([...REVIEW_NOTIFICATION_EVENT_TYPES])})`;
  }
  return Prisma.sql`AND FALSE`;
}

function scopeRefFromQuery(q: {
  scope: string;
  companyId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
}): ScopeRef | null {
  if (q.scope === 'company' && q.companyId) return { type: 'company', companyId: q.companyId };
  if (q.scope === 'department' && q.departmentId)
    return { type: 'department', departmentId: q.departmentId };
  if (q.scope === 'team' && q.teamId) return { type: 'team', teamId: q.teamId };
  return null;
}

function getScopeFromOwner(owner: OwnerScopeRow | null): {
  scopeType: 'team' | 'department' | 'company' | 'personal';
  scopeId: string | null;
  scopeName: string;
} {
  if (!owner) return { scopeType: 'personal', scopeId: null, scopeName: 'Personal' };
  const name = owner.displayName?.trim() || 'Personal';
  if (owner.teamId) return { scopeType: 'team', scopeId: owner.teamId, scopeName: name };
  if (owner.departmentId)
    return { scopeType: 'department', scopeId: owner.departmentId, scopeName: name };
  if (owner.companyId) return { scopeType: 'company', scopeId: owner.companyId, scopeName: name };
  return { scopeType: 'personal', scopeId: null, scopeName: name };
}

function userPreferencesFromJson(preferences: unknown): UserPreferences {
  if (preferences != null && typeof preferences === 'object') {
    return preferences as UserPreferences;
  }
  return {};
}

async function getDraftsScope(
  prisma: PrismaClient,
  userId: string,
  query: MeDraftsQuery
): Promise<{ scopeContextIds: string[]; scopeDocumentIds: string[] }> {
  if (!query.scope && !query.companyId && !query.departmentId && !query.teamId) {
    const readable = await getReadableCatalogScope(prisma, userId);
    return {
      scopeContextIds: readable.contextIds,
      scopeDocumentIds: readable.documentIdsFromGrants,
    };
  }
  if (query.scope === 'personal') {
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
    return {
      scopeContextIds: [
        ...processContexts.map((item) => item.contextId),
        ...projectContexts.map((item) => item.contextId),
        ...subcontextContexts.map((item) => item.contextId),
      ],
      scopeDocumentIds: [],
    };
  }
  if (query.scope === 'shared') {
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
    return {
      scopeContextIds: [],
      scopeDocumentIds: [...new Set([...userGrantDocIds, ...teamGrantDocIds, ...deptGrantDocIds])],
    };
  }

  const ownerFilter =
    query.companyId != null
      ? { companyId: query.companyId }
      : query.departmentId != null
        ? { departmentId: query.departmentId }
        : { teamId: query.teamId! };
  const [processContexts, projectContexts, subcontextContexts] = await Promise.all([
    prisma.process.findMany({
      where: { deletedAt: null, owner: ownerFilter },
      select: { contextId: true },
    }),
    prisma.project.findMany({
      where: { deletedAt: null, owner: ownerFilter },
      select: { contextId: true },
    }),
    prisma.subcontext.findMany({
      where: { project: { owner: ownerFilter } },
      select: { contextId: true },
    }),
  ]);

  return {
    scopeContextIds: [
      ...processContexts.map((item) => item.contextId),
      ...projectContexts.map((item) => item.contextId),
      ...subcontextContexts.map((item) => item.contextId),
    ],
    scopeDocumentIds: [],
  };
}

async function getWritableScope(prisma: PrismaClient, userId: string) {
  return getWritableCatalogScope(prisma, userId);
}

export {
  enrichMeNotificationItems,
  notificationsCategorySql,
  scopeRefFromQuery,
  ownerScopeSelect,
  getScopeFromOwner,
  userPreferencesFromJson,
  getDraftsScope,
  getWritableScope,
};
