import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '../../../../generated/prisma/client.js';

type NotificationCategory = 'documentChanges' | 'draftRequests' | 'reminders';

/** Minutes: merge repeated `document-updated` for same user+document into one row. `0` = off. @default 15 */
export function getNotificationCoalesceWindowMinutes(): number {
  const raw = process.env.NOTIFICATION_COALESCE_WINDOW_MINUTES;
  if (raw == null || raw.trim() === '') return 15;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 15;
  if (n > 10080) return 10080; // 7 days
  return n;
}

/** Max rows per user; deletes oldest beyond cap. `0` = off. */
export function getNotificationHardCapPerUser(): number {
  const raw = process.env.NOTIFICATION_HARD_CAP_PER_USER;
  if (raw == null || raw.trim() === '') return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 500_000) return 500_000;
  return n;
}

/** Maps event_type strings to the three preference channels (Settings / `me` preferences). */
function resolveCategory(eventType: string): NotificationCategory {
  if (eventType.includes('draft-request')) return 'draftRequests';
  if (eventType.includes('reminder')) return 'reminders';
  return 'documentChanges';
}

function shouldCoalesceInAppEvent(eventType: string): boolean {
  return eventType === 'document-updated';
}

async function tryCoalesceInAppNotification(
  prisma: PrismaClient,
  userId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const windowMin = getNotificationCoalesceWindowMinutes();
  if (windowMin <= 0 || !shouldCoalesceInAppEvent(eventType)) return false;
  const documentId = typeof payload.documentId === 'string' ? payload.documentId : null;
  if (documentId == null || documentId === '') return false;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM user_notification
    WHERE user_id = ${userId}
      AND event_type = ${eventType}
      AND payload->>'documentId' = ${documentId}
      AND created_at >= NOW() - (${windowMin}::int * INTERVAL '1 minute')
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const id = rows[0]?.id;
  if (id == null) return false;

  await prisma.$executeRaw(Prisma.sql`
    UPDATE user_notification
    SET
      payload = ${JSON.stringify(payload)}::jsonb,
      created_at = NOW(),
      read_at = NULL,
      event_type = ${eventType}
    WHERE id = ${id}
  `);
  return true;
}

async function truncateUserNotificationsToCap(
  prisma: PrismaClient,
  userId: string,
  cap: number
): Promise<void> {
  if (cap <= 0) return;
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM user_notification
    WHERE user_id = ${userId}
      AND id IN (
        SELECT id FROM (
          SELECT id
          FROM user_notification
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
          OFFSET ${cap}::int
        ) AS excess
      )
  `);
}

export async function dispatchNotificationEvent(
  prisma: PrismaClient,
  args: { eventType: string; targetUserIds: string[]; payload: Record<string, unknown> }
): Promise<{ deliveredCount: number; emailQueuedCount: number }> {
  if (args.targetUserIds.length === 0) {
    return { deliveredCount: 0, emailQueuedCount: 0 };
  }

  const users = await prisma.user.findMany({
    where: { id: { in: args.targetUserIds }, deletedAt: null },
    select: { id: true, email: true, preferences: true },
  });

  const category = resolveCategory(args.eventType);
  let deliveredCount = 0;
  let emailQueuedCount = 0;
  const emailQueueEnabled =
    (process.env.NOTIFICATION_EMAIL_QUEUE_ENABLED ?? 'false').toLowerCase() === 'true';

  for (const user of users) {
    const prefs =
      user.preferences != null && typeof user.preferences === 'object'
        ? (user.preferences as {
            notificationSettings?: {
              inApp?: Partial<Record<NotificationCategory, boolean>>;
              email?: Partial<Record<NotificationCategory, boolean>>;
            };
          })
        : {};

    const inAppEnabled = prefs.notificationSettings?.inApp?.[category] ?? true;
    if (inAppEnabled) {
      const coalesced = await tryCoalesceInAppNotification(
        prisma,
        user.id,
        args.eventType,
        args.payload
      );
      if (!coalesced) {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO user_notification (id, user_id, event_type, payload, created_at, read_at)
          VALUES (${randomUUID()}, ${user.id}, ${args.eventType}, ${JSON.stringify(args.payload)}::jsonb, NOW(), NULL)
        `);
      }
      await truncateUserNotificationsToCap(prisma, user.id, getNotificationHardCapPerUser());
      deliveredCount += 1;
    }

    if (emailQueueEnabled) {
      const emailEnabled = prefs.notificationSettings?.email?.[category] ?? false;
      if (emailEnabled && user.email != null && user.email.trim() !== '') {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO notification_email_outbox (
            id,
            user_id,
            email,
            event_type,
            payload,
            status,
            queued_at,
            sent_at,
            error
          )
          VALUES (
            ${randomUUID()},
            ${user.id},
            ${user.email},
            ${args.eventType},
            ${JSON.stringify(args.payload)}::jsonb,
            'queued',
            NOW(),
            NULL,
            NULL
          )
        `);
        emailQueuedCount += 1;
      }
    }
  }

  return { deliveredCount, emailQueuedCount };
}
