import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../db.js';
import { hashPassword } from '../../auth/services/password.js';
import {
  dispatchNotificationEvent,
  getNotificationCoalesceWindowMinutes,
  getNotificationHardCapPerUser,
} from '../services/notificationDispatchService.js';
import {
  getNotificationRetentionDays,
  runUserNotificationRetention,
} from '../services/notificationRetentionService.js';

const TS = `notif-life-${Date.now()}`;

describe('notification retention', () => {
  let userId: string;
  let oldRowId: string;

  beforeAll(async () => {
    const pw = await hashPassword('test');
    const u = await prisma.user.create({
      data: { name: 'Retention', email: `ret-${TS}@test.de`, passwordHash: pw },
    });
    userId = u.id;
  });

  afterAll(async () => {
    if (oldRowId) {
      await prisma.$executeRaw`DELETE FROM user_notification WHERE id = ${oldRowId}`;
    }
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('runUserNotificationRetention removes rows older than NOTIFICATION_RETENTION_DAYS', async () => {
    oldRowId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO user_notification (id, user_id, event_type, payload, created_at, read_at)
      VALUES (
        ${oldRowId},
        ${userId},
        'document-published',
        '{}'::jsonb,
        NOW() - INTERVAL '400 days',
        NOW()
      )
    `;

    const prev = process.env.NOTIFICATION_RETENTION_DAYS;
    process.env.NOTIFICATION_RETENTION_DAYS = '30';
    try {
      expect(getNotificationRetentionDays()).toBe(30);
      const deleted = await runUserNotificationRetention(prisma);
      expect(deleted).toBeGreaterThanOrEqual(1);
      const left = await prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(*)::bigint AS c FROM user_notification WHERE id = ${oldRowId}
      `;
      expect(Number(left[0]?.c ?? 0n)).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.NOTIFICATION_RETENTION_DAYS;
      else process.env.NOTIFICATION_RETENTION_DAYS = prev;
    }
  });
});

describe('notification coalesce + hard cap', () => {
  let userId: string;
  const documentId = `coalesce-doc-${TS}`;

  beforeAll(async () => {
    const pw = await hashPassword('test');
    const u = await prisma.user.create({
      data: { name: 'Coalesce', email: `coa-${TS}@test.de`, passwordHash: pw },
    });
    userId = u.id;
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM user_notification WHERE user_id = ${userId}`;
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  beforeEach(async () => {
    await prisma.$executeRaw`DELETE FROM user_notification WHERE user_id = ${userId}`;
  });

  it('document-updated coalesces within window for same user and documentId', async () => {
    const prevW = process.env.NOTIFICATION_COALESCE_WINDOW_MINUTES;
    process.env.NOTIFICATION_COALESCE_WINDOW_MINUTES = '60';
    try {
      expect(getNotificationCoalesceWindowMinutes()).toBe(60);
      await dispatchNotificationEvent(prisma, {
        eventType: 'document-updated',
        targetUserIds: [userId],
        payload: { documentId, contextId: null, n: 1 },
      });
      await dispatchNotificationEvent(prisma, {
        eventType: 'document-updated',
        targetUserIds: [userId],
        payload: { documentId, contextId: null, n: 2 },
      });
      const rows = await prisma.$queryRaw<Array<{ c: bigint; max_n: string | null }>>`
        SELECT
          COUNT(*)::bigint AS c,
          MAX(payload->>'n') AS max_n
        FROM user_notification
        WHERE user_id = ${userId} AND event_type = 'document-updated'
      `;
      expect(Number(rows[0]?.c ?? 0n)).toBe(1);
      expect(rows[0]?.max_n).toBe('2');
    } finally {
      if (prevW === undefined) delete process.env.NOTIFICATION_COALESCE_WINDOW_MINUTES;
      else process.env.NOTIFICATION_COALESCE_WINDOW_MINUTES = prevW;
    }
  });

  it('hard cap trims oldest rows for a user', async () => {
    const prevC = process.env.NOTIFICATION_COALESCE_WINDOW_MINUTES;
    const prevCap = process.env.NOTIFICATION_HARD_CAP_PER_USER;
    process.env.NOTIFICATION_COALESCE_WINDOW_MINUTES = '0';
    process.env.NOTIFICATION_HARD_CAP_PER_USER = '2';
    try {
      expect(getNotificationCoalesceWindowMinutes()).toBe(0);
      expect(getNotificationHardCapPerUser()).toBe(2);
      for (let i = 0; i < 3; i += 1) {
        await dispatchNotificationEvent(prisma, {
          eventType: 'document-published',
          targetUserIds: [userId],
          payload: { documentId: `d-${i}-${TS}`, seq: i },
        });
      }
      const rows = await prisma.$queryRaw<Array<{ c: bigint }>>`
        SELECT COUNT(*)::bigint AS c FROM user_notification WHERE user_id = ${userId}
      `;
      expect(Number(rows[0]?.c ?? 0n)).toBe(2);
    } finally {
      if (prevC === undefined) delete process.env.NOTIFICATION_COALESCE_WINDOW_MINUTES;
      else process.env.NOTIFICATION_COALESCE_WINDOW_MINUTES = prevC;
      if (prevCap === undefined) delete process.env.NOTIFICATION_HARD_CAP_PER_USER;
      else process.env.NOTIFICATION_HARD_CAP_PER_USER = prevCap;
    }
  });
});
