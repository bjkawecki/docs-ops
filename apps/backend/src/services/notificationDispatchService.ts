import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';

type NotificationCategory = 'documentChanges' | 'draftRequests' | 'reminders';

function resolveCategory(eventType: string): NotificationCategory {
  if (eventType.includes('draft-request')) return 'draftRequests';
  if (eventType.includes('reminder')) return 'reminders';
  return 'documentChanges';
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
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO user_notification (id, user_id, event_type, payload, created_at, read_at)
        VALUES (${randomUUID()}, ${user.id}, ${args.eventType}, ${JSON.stringify(args.payload)}::jsonb, NOW(), NULL)
      `);
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
