import type { FastifyReply, FastifyRequest } from 'fastify';
import { excludeUserIds } from '../../notifications/services/notificationRecipients.js';
import { enqueueNotificationEvent } from '../services/route-support/documentRouteSupport.js';
import { UnsupportedScopeWriteGrantError } from '../services/collaboration/documentGrantsService.js';

export function handleUnsupportedScopeWriteGrant(
  reply: FastifyReply,
  error: unknown
): error is UnsupportedScopeWriteGrantError {
  if (error instanceof UnsupportedScopeWriteGrantError) {
    void reply.status(400).send({ error: error.message });
    return true;
  }
  return false;
}

export async function notifyDocumentGrantsChanged(
  request: FastifyRequest,
  params: {
    documentId: string;
    actorUserId: string;
    changedUserIds: string[];
    logMessage: string;
  }
): Promise<void> {
  const { documentId, actorUserId, changedUserIds, logMessage } = params;
  try {
    const targets = excludeUserIds(changedUserIds, actorUserId);
    if (targets.length > 0) {
      await enqueueNotificationEvent({
        eventType: 'document-grants-changed',
        targetUserIds: targets,
        payload: { documentId, changedByUserId: actorUserId },
      });
    }
  } catch (error) {
    request.log.warn({ error, documentId }, logMessage);
  }
}
