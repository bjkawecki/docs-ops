import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '../../../../generated/prisma/client.js';
import type { AdminBroadcastTargetKind } from '../schemas/notifications.js';
import { enqueueNotificationEvent } from '../../notifications/services/notificationEnqueueService.js';
import { enqueueJob } from '../../../infrastructure/jobs/client.js';
import { getAdminBroadcastRowById, insertAdminBroadcastRow } from './adminBroadcastRepository.js';
import { resolveBroadcastTargetUserIds } from './adminBroadcastTargets.js';
import {
  ADMIN_BROADCAST_JOB,
  adminBroadcastJobKey,
  type AdminBroadcastStatus,
} from './adminBroadcastTypes.js';

export { ADMIN_BROADCAST_JOB, adminBroadcastJobKey, type AdminBroadcastStatus };

export async function deliverAdminBroadcastById(
  prisma: PrismaClient,
  broadcastId: string
): Promise<{ broadcastId: string; deliveredCount: number }> {
  const row = await getAdminBroadcastRowById(prisma, broadcastId);
  if (!row) {
    throw new Error('Broadcast not found');
  }
  if (row.status === 'cancelled') {
    throw new Error('Broadcast was cancelled');
  }
  if (row.status === 'sent') {
    return { broadcastId, deliveredCount: row.delivered_count };
  }

  const userIds = row.target_kind === 'users' ? (row.target_payload.userIds ?? []) : undefined;
  const targetUserIds = await resolveBroadcastTargetUserIds(prisma, row.target_kind, userIds);

  if (targetUserIds.length > 0) {
    await enqueueNotificationEvent({
      eventType: 'admin-broadcast',
      targetUserIds,
      payload: {
        broadcastId,
        title: row.title,
        message: row.message,
        targetKind: row.target_kind,
        actorUserId: row.actor_user_id,
      },
    });
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE admin_notification_broadcast
    SET
      status = 'sent',
      sent_at = NOW(),
      scheduled_at = NULL,
      delivered_count = ${targetUserIds.length},
      job_id = NULL
    WHERE id = ${broadcastId}
  `);

  return { broadcastId, deliveredCount: targetUserIds.length };
}

export async function createAdminBroadcast(
  prisma: PrismaClient,
  args: {
    actorUserId: string;
    title: string;
    message: string;
    targetKind: AdminBroadcastTargetKind;
    userIds?: string[];
    sendAt?: Date | null;
  }
): Promise<{
  broadcastId: string;
  status: AdminBroadcastStatus;
  deliveredCount: number;
  scheduledAt: string | null;
}> {
  const broadcastId = randomUUID();
  const now = Date.now();
  const sendAt = args.sendAt ?? null;
  const isScheduled = sendAt != null && sendAt.getTime() > now + 1000;

  if (isScheduled && sendAt != null) {
    await insertAdminBroadcastRow(prisma, {
      broadcastId,
      actorUserId: args.actorUserId,
      title: args.title,
      message: args.message,
      targetKind: args.targetKind,
      userIds: args.userIds,
      status: 'scheduled',
      scheduledAt: sendAt,
      deliveredCount: 0,
    });

    const jobId = await enqueueJob(
      ADMIN_BROADCAST_JOB,
      { broadcastId },
      { startAfter: sendAt, singletonKey: adminBroadcastJobKey(broadcastId) }
    );

    await prisma.$executeRaw(Prisma.sql`
      UPDATE admin_notification_broadcast
      SET job_id = ${jobId}
      WHERE id = ${broadcastId}
    `);

    return {
      broadcastId,
      status: 'scheduled',
      deliveredCount: 0,
      scheduledAt: sendAt.toISOString(),
    };
  }

  await insertAdminBroadcastRow(prisma, {
    broadcastId,
    actorUserId: args.actorUserId,
    title: args.title,
    message: args.message,
    targetKind: args.targetKind,
    userIds: args.userIds,
    status: 'scheduled',
    scheduledAt: null,
    deliveredCount: 0,
  });

  const delivered = await deliverAdminBroadcastById(prisma, broadcastId);
  return {
    broadcastId,
    status: 'sent',
    deliveredCount: delivered.deliveredCount,
    scheduledAt: null,
  };
}

/** @deprecated use createAdminBroadcast */
export async function sendAdminBroadcast(
  prisma: PrismaClient,
  args: {
    actorUserId: string;
    title: string;
    message: string;
    targetKind: AdminBroadcastTargetKind;
    userIds?: string[];
  }
): Promise<{ broadcastId: string; deliveredCount: number; targetUserCount: number }> {
  const result = await createAdminBroadcast(prisma, args);
  return {
    broadcastId: result.broadcastId,
    deliveredCount: result.deliveredCount,
    targetUserCount: result.deliveredCount,
  };
}
