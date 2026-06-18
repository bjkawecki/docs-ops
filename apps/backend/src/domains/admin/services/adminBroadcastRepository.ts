import { Prisma, type PrismaClient } from '../../../../generated/prisma/client.js';
import type { AdminBroadcastTargetKind } from '../schemas/notifications.js';
import type { AdminBroadcastStatus } from './adminBroadcastTypes.js';

export type AdminBroadcastRow = {
  id: string;
  actor_user_id: string;
  title: string;
  message: string;
  target_kind: AdminBroadcastTargetKind;
  target_payload: { userIds?: string[] };
  status: AdminBroadcastStatus;
  scheduled_at: Date | null;
  sent_at: Date | null;
  delivered_count: number;
  job_id: string | null;
  created_at: Date;
};

export async function getAdminBroadcastRowById(
  prisma: PrismaClient,
  broadcastId: string
): Promise<AdminBroadcastRow | null> {
  const rows = await prisma.$queryRaw<AdminBroadcastRow[]>(Prisma.sql`
    SELECT
      id,
      actor_user_id,
      title,
      message,
      target_kind,
      target_payload,
      status,
      scheduled_at,
      sent_at,
      delivered_count,
      job_id,
      created_at
    FROM admin_notification_broadcast
    WHERE id = ${broadcastId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function insertAdminBroadcastRow(
  prisma: PrismaClient,
  args: {
    broadcastId: string;
    actorUserId: string;
    title: string;
    message: string;
    targetKind: AdminBroadcastTargetKind;
    userIds?: string[];
    status: AdminBroadcastStatus;
    scheduledAt?: Date | null;
    sentAt?: Date | null;
    deliveredCount: number;
    jobId?: string | null;
  }
): Promise<void> {
  const targetPayload = args.targetKind === 'users' ? { userIds: args.userIds ?? [] } : {};
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO admin_notification_broadcast (
      id,
      actor_user_id,
      title,
      message,
      target_kind,
      target_payload,
      status,
      scheduled_at,
      sent_at,
      delivered_count,
      job_id,
      created_at
    )
    VALUES (
      ${args.broadcastId},
      ${args.actorUserId},
      ${args.title},
      ${args.message},
      ${args.targetKind},
      ${JSON.stringify(targetPayload)}::jsonb,
      ${args.status},
      ${args.scheduledAt ?? null},
      ${args.sentAt ?? null},
      ${args.deliveredCount},
      ${args.jobId ?? null},
      NOW()
    )
  `);
}

export async function listAdminBroadcastHistory(
  prisma: PrismaClient,
  limit: number,
  offset: number,
  status: AdminBroadcastStatus | 'all' = 'sent'
): Promise<{
  items: Array<{
    id: string;
    actorUserId: string;
    title: string;
    message: string;
    targetKind: string;
    status: AdminBroadcastStatus;
    deliveredCount: number;
    createdAt: Date;
    scheduledAt: Date | null;
    sentAt: Date | null;
  }>;
  total: number;
}> {
  const statusFilter = status === 'all' ? Prisma.empty : Prisma.sql`AND status = ${status}`;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      actor_user_id: string;
      title: string;
      message: string;
      target_kind: string;
      status: AdminBroadcastStatus;
      delivered_count: number;
      created_at: Date;
      scheduled_at: Date | null;
      sent_at: Date | null;
    }>
  >(Prisma.sql`
    SELECT
      id,
      actor_user_id,
      title,
      message,
      target_kind,
      status,
      delivered_count,
      created_at,
      scheduled_at,
      sent_at
    FROM admin_notification_broadcast
    WHERE 1 = 1
    ${statusFilter}
    ORDER BY COALESCE(sent_at, scheduled_at, created_at) DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const countRows = await prisma.$queryRaw<Array<{ c: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS c
    FROM admin_notification_broadcast
    WHERE 1 = 1
    ${statusFilter}
  `);

  return {
    items: rows.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      title: row.title,
      message: row.message,
      targetKind: row.target_kind,
      status: row.status,
      deliveredCount: row.delivered_count,
      createdAt: row.created_at,
      scheduledAt: row.scheduled_at,
      sentAt: row.sent_at,
    })),
    total: Number(countRows[0]?.c ?? 0n),
  };
}

export async function listScheduledAdminBroadcasts(prisma: PrismaClient): Promise<
  Array<{
    id: string;
    title: string;
    message: string;
    targetKind: AdminBroadcastTargetKind;
    scheduledAt: Date;
    actorUserId: string;
  }>
> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      actor_user_id: string;
      title: string;
      message: string;
      target_kind: AdminBroadcastTargetKind;
      scheduled_at: Date;
    }>
  >(Prisma.sql`
    SELECT id, actor_user_id, title, message, target_kind, scheduled_at
    FROM admin_notification_broadcast
    WHERE status = 'scheduled'
    ORDER BY scheduled_at ASC
  `);

  return rows.map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    title: row.title,
    message: row.message,
    targetKind: row.target_kind,
    scheduledAt: row.scheduled_at,
  }));
}
