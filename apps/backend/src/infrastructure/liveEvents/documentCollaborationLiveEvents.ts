import type { PrismaClient } from '../../../generated/prisma/client.js';
import { isLiveEventsEnabled } from './liveEventConfig.js';
import { notifyLiveEvent } from './liveEventNotify.js';

export type DocumentCollaborationChangedMeta = {
  draftRevision?: number;
  pendingSuggestionCount?: number;
};

export async function notifyDocumentCollaborationChanged(
  prisma: PrismaClient,
  userId: string,
  documentId: string,
  meta?: DocumentCollaborationChangedMeta
): Promise<void> {
  if (!isLiveEventsEnabled()) return;

  await notifyLiveEvent(prisma, {
    target: 'user',
    userId,
    event: {
      v: 1,
      type: 'document.collaboration-changed',
      payload: {
        documentId,
        ...(meta?.draftRevision != null ? { draftRevision: meta.draftRevision } : {}),
        ...(meta?.pendingSuggestionCount != null
          ? { pendingSuggestionCount: meta.pendingSuggestionCount }
          : {}),
      },
    },
  });
}

export async function notifyDocumentCollaborationChangedMany(
  prisma: PrismaClient,
  userIds: string[],
  documentId: string,
  meta?: DocumentCollaborationChangedMeta
): Promise<void> {
  if (!isLiveEventsEnabled() || userIds.length === 0) return;

  const unique = [...new Set(userIds)];
  await Promise.all(
    unique.map((userId) => notifyDocumentCollaborationChanged(prisma, userId, documentId, meta))
  );
}

/** Non-blocking collaboration SSE for routes and services. */
export function notifyDocumentCollaborationChangedManyFireAndForget(
  prisma: PrismaClient,
  userIds: string[],
  documentId: string,
  meta?: DocumentCollaborationChangedMeta
): void {
  void notifyDocumentCollaborationChangedMany(prisma, userIds, documentId, meta).catch(() => {
    // live events are best-effort
  });
}
