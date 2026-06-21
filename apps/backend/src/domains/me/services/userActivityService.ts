import type { PrismaClient } from '../../../../generated/prisma/client.js';

const TOUCH_THROTTLE_MS = 60_000;
const lastTouchAtByUser = new Map<string, number>();

/**
 * Updates User.lastActiveAt at most once per minute per user (in-process throttle).
 */
export async function touchUserActivity(prisma: PrismaClient, userId: string): Promise<void> {
  const now = Date.now();
  const last = lastTouchAtByUser.get(userId) ?? 0;
  if (now - last < TOUCH_THROTTLE_MS) return;
  lastTouchAtByUser.set(userId, now);
  await prisma.user.update({
    where: { id: userId },
    data: { lastActiveAt: new Date() },
  });
}

/** Non-blocking activity touch for auth and SSE hooks. */
export function touchUserActivityFireAndForget(prisma: PrismaClient, userId: string): void {
  void touchUserActivity(prisma, userId).catch(() => {
    // presence is best-effort
  });
}

/** Clears in-memory throttle (tests only). */
export function resetUserActivityThrottleForTests(): void {
  lastTouchAtByUser.clear();
}
