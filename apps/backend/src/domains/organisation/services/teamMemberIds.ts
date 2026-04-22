import type { PrismaClient } from '../../../../generated/prisma/client.js';

/** Eindeutige User-IDs aller Team-Mitglieder für die gegebenen Teams (Reihenfolge nicht garantiert). */
export async function distinctUserIdsForTeamIds(
  prisma: PrismaClient,
  teamIds: string[]
): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const members = await prisma.teamMember.findMany({
    where: { teamId: { in: teamIds } },
    select: { userId: true },
  });
  return [...new Set(members.map((m) => m.userId))];
}
