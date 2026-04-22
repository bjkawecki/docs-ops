import { Prisma, type PrismaClient } from '../../../../generated/prisma/client.js';

/**
 * Days after which in-app notification rows are deleted (read and unread).
 * Set to `0` to disable retention cleanup.
 * @default 90
 */
export function getNotificationRetentionDays(): number {
  const raw = process.env.NOTIFICATION_RETENTION_DAYS;
  if (raw == null || raw.trim() === '') return 90;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 90;
  if (n > 3650) return 3650;
  return n;
}

/**
 * Deletes `user_notification` rows older than the configured retention window.
 * @returns number of deleted rows
 */
export async function runUserNotificationRetention(prisma: PrismaClient): Promise<number> {
  const days = getNotificationRetentionDays();
  if (days <= 0) return 0;

  const result = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM user_notification
    WHERE created_at < NOW() - (${days}::int * INTERVAL '1 day')
  `);
  return typeof result === 'number' ? result : Number(result);
}
