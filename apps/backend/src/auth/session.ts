import type { PrismaClient } from '../../generated/prisma/client.js';

const DEFAULT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 Tage

function getMaxAgeSeconds(): number {
  const env = process.env.SESSION_MAX_AGE_SECONDS;
  if (env === undefined) return DEFAULT_MAX_AGE_SECONDS;
  const n = Number.parseInt(env, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_AGE_SECONDS;
}

/**
 * Legt eine neue Session für den User an (nach erfolgreichem Login).
 * @returns Session-ID (für Cookie) und expiresAt
 */
export async function createSession(
  prisma: PrismaClient,
  userId: string
): Promise<{ id: string; expiresAt: Date }> {
  const maxAge = getMaxAgeSeconds();
  const expiresAt = new Date(Date.now() + maxAge * 1000);
  const session = await prisma.session.create({
    data: { userId, expiresAt },
  });
  return { id: session.id, expiresAt: session.expiresAt };
}

/**
 * Lädt Session anhand der Session-ID und prüft expiresAt.
 * @returns Session inkl. User, oder null wenn ungültig/abgelaufen
 */
export async function findValidSession(
  prisma: PrismaClient,
  sessionId: string
): Promise<{
  session: { id: string; userId: string; expiresAt: Date };
  user: {
    id: string;
    name: string;
    email: string | null;
    isAdmin: boolean;
    deletedAt: Date | null;
  };
} | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    return null;
  }
  if (session.user.deletedAt) return null;
  return {
    session: {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
    },
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      isAdmin: session.user.isAdmin,
      deletedAt: session.user.deletedAt,
    },
  };
}

/**
 * Löscht eine Session (Logout).
 */
export async function deleteSession(prisma: PrismaClient, sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}
