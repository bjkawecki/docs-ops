import { Prisma, type PrismaClient } from '../../../../generated/prisma/client.js';

type OutboxRow = {
  id: string;
  email: string;
};

export type NotificationEmailOutboxConsumeResult = {
  pickedCount: number;
  sentCount: number;
  failedCount: number;
};

function isLikelyEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.includes('@') && trimmed.includes('.');
}

export async function consumeNotificationEmailOutbox(
  prisma: PrismaClient,
  args?: { batchSize?: number }
): Promise<NotificationEmailOutboxConsumeResult> {
  const batchSize = Math.max(1, Math.min(200, args?.batchSize ?? 20));
  let sentCount = 0;
  let failedCount = 0;

  const pickedRows = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<OutboxRow[]>(Prisma.sql`
      SELECT id, email
      FROM notification_email_outbox
      WHERE status = 'queued'
      ORDER BY queued_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `);

    for (const row of rows) {
      // Placeholder "delivery": validates minimum email format.
      // A real SMTP/provider integration can replace this block later.
      const canSend = isLikelyEmail(row.email);
      if (canSend) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE notification_email_outbox
          SET status = 'sent',
              sent_at = NOW(),
              error = NULL
          WHERE id = ${row.id}
        `);
        sentCount += 1;
      } else {
        await tx.$executeRaw(Prisma.sql`
          UPDATE notification_email_outbox
          SET status = 'failed',
              sent_at = NULL,
              error = 'Invalid recipient email address'
          WHERE id = ${row.id}
        `);
        failedCount += 1;
      }
    }

    return rows;
  });

  return {
    pickedCount: pickedRows.length,
    sentCount,
    failedCount,
  };
}
