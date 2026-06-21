import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../../db.js';
import { resetUserActivityThrottleForTests, touchUserActivity } from './userActivityService.js';

const TS = `activity-${Date.now()}`;

describe('userActivityService', () => {
  let userId: string;

  beforeEach(async () => {
    resetUserActivityThrottleForTests();
    const user = await prisma.user.create({
      data: { name: 'Activity User', email: `${TS}-${Math.random()}@test.de` },
    });
    userId = user.id;
  });

  afterEach(async () => {
    resetUserActivityThrottleForTests();
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('touchUserActivity updates lastActiveAt', async () => {
    await touchUserActivity(prisma, userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastActiveAt: true },
    });
    expect(user?.lastActiveAt).not.toBeNull();
  });

  it('touchUserActivity is throttled to once per minute', async () => {
    await touchUserActivity(prisma, userId);
    const first = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastActiveAt: true },
    });
    await new Promise((r) => setTimeout(r, 20));
    await touchUserActivity(prisma, userId);
    const second = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastActiveAt: true },
    });
    expect(second?.lastActiveAt?.getTime()).toBe(first?.lastActiveAt?.getTime());
  });
});
