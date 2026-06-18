import { Prisma, type PrismaClient } from '../../../../generated/prisma/client.js';
import { cancelJob, enqueueJob } from '../../../infrastructure/jobs/client.js';
import { deliverAdminBroadcastById } from './adminBroadcastNotificationService.js';
import { getAdminBroadcastRowById } from './adminBroadcastRepository.js';
import { ADMIN_BROADCAST_JOB, adminBroadcastJobKey } from './adminBroadcastTypes.js';

async function cancelScheduledBroadcastJob(jobId: string | null): Promise<void> {
  if (!jobId) return;
  try {
    await cancelJob(ADMIN_BROADCAST_JOB, jobId);
  } catch {
    /* job may already be running or gone */
  }
}

export async function cancelScheduledAdminBroadcast(
  prisma: PrismaClient,
  broadcastId: string
): Promise<void> {
  const row = await getAdminBroadcastRowById(prisma, broadcastId);
  if (!row) throw new Error('Broadcast not found');
  if (row.status !== 'scheduled') {
    throw new Error('Only scheduled broadcasts can be cancelled');
  }
  await cancelScheduledBroadcastJob(row.job_id);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE admin_notification_broadcast
    SET status = 'cancelled', scheduled_at = NULL, job_id = NULL
    WHERE id = ${broadcastId}
  `);
}

export async function rescheduleScheduledAdminBroadcast(
  prisma: PrismaClient,
  broadcastId: string,
  sendAt: Date
): Promise<{ scheduledAt: string }> {
  const row = await getAdminBroadcastRowById(prisma, broadcastId);
  if (!row) throw new Error('Broadcast not found');
  if (row.status !== 'scheduled') {
    throw new Error('Only scheduled broadcasts can be rescheduled');
  }
  if (sendAt.getTime() <= Date.now() + 1000) {
    throw new Error('Scheduled time must be in the future');
  }

  await cancelScheduledBroadcastJob(row.job_id);

  const jobId = await enqueueJob(
    ADMIN_BROADCAST_JOB,
    { broadcastId },
    { startAfter: sendAt, singletonKey: adminBroadcastJobKey(broadcastId) }
  );

  await prisma.$executeRaw(Prisma.sql`
    UPDATE admin_notification_broadcast
    SET scheduled_at = ${sendAt}, job_id = ${jobId}
    WHERE id = ${broadcastId}
  `);

  return { scheduledAt: sendAt.toISOString() };
}

export async function sendScheduledAdminBroadcastNow(
  prisma: PrismaClient,
  broadcastId: string
): Promise<{ deliveredCount: number }> {
  const row = await getAdminBroadcastRowById(prisma, broadcastId);
  if (!row) throw new Error('Broadcast not found');
  if (row.status !== 'scheduled') {
    throw new Error('Only scheduled broadcasts can be sent now');
  }
  await cancelScheduledBroadcastJob(row.job_id);
  const result = await deliverAdminBroadcastById(prisma, broadcastId);
  return { deliveredCount: result.deliveredCount };
}
