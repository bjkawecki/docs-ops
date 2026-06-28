import type { PrismaClient } from '../../../../generated/prisma/client.js';
import {
  notifyDocumentCollaborationChangedManyFireAndForget,
  type DocumentCollaborationChangedMeta,
} from '../../../../infrastructure/liveEvents/documentCollaborationLiveEvents.js';
import { notifyDraftPresenceChangedManyFireAndForget } from '../../../../infrastructure/liveEvents/draftPresenceLiveEvents.js';
import {
  excludeUserIds,
  listUserIdsWhoCanReadDocument,
  listUserIdsWhoCanReadLeadDraft,
} from '../../../notifications/services/notificationRecipients.js';

/** SSE to users who can see the lead draft after a save. */
export function notifyLeadDraftCollaborationChanged(
  prisma: PrismaClient,
  documentId: string,
  actorUserId?: string | null,
  meta?: DocumentCollaborationChangedMeta
): void {
  void (async () => {
    const userIds = excludeUserIds(
      await listUserIdsWhoCanReadLeadDraft(prisma, documentId),
      actorUserId
    );
    notifyDocumentCollaborationChangedManyFireAndForget(prisma, userIds, documentId, meta);
  })();
}

/** SSE after draft editor presence changes. */
export function notifyDraftPresenceChanged(
  prisma: PrismaClient,
  documentId: string,
  actorUserId?: string | null
): void {
  void (async () => {
    const userIds = excludeUserIds(
      await listUserIdsWhoCanReadLeadDraft(prisma, documentId),
      actorUserId
    );
    notifyDraftPresenceChangedManyFireAndForget(prisma, userIds, documentId);
  })();
}

/** SSE to all readers after publish (published view refresh). */
export function notifyDocumentPublishedCollaborationChanged(
  prisma: PrismaClient,
  documentId: string,
  actorUserId?: string | null
): void {
  void (async () => {
    const userIds = excludeUserIds(
      await listUserIdsWhoCanReadDocument(prisma, documentId),
      actorUserId
    );
    notifyDocumentCollaborationChangedManyFireAndForget(prisma, userIds, documentId);
  })();
}
