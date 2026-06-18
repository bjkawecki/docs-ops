import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { AdminBroadcastTargetKind } from '../schemas/notifications.js';

export async function resolveBroadcastTargetUserIds(
  prisma: PrismaClient,
  targetKind: AdminBroadcastTargetKind,
  userIds?: string[]
): Promise<string[]> {
  if (targetKind === 'users') {
    const ids = userIds ?? [];
    if (ids.length === 0) return [];
    const rows = await prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  if (targetKind === 'all') {
    const rows = await prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  if (targetKind === 'admins') {
    const rows = await prisma.user.findMany({
      where: { isAdmin: true, deletedAt: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  if (targetKind === 'company_leads') {
    const rows = await prisma.companyLead.findMany({
      where: { user: { deletedAt: null } },
      select: { userId: true },
    });
    return [...new Set(rows.map((r) => r.userId))];
  }

  if (targetKind === 'department_leads') {
    const rows = await prisma.departmentLead.findMany({
      where: { user: { deletedAt: null } },
      select: { userId: true },
    });
    return [...new Set(rows.map((r) => r.userId))];
  }

  if (targetKind === 'team_leads') {
    const rows = await prisma.teamLead.findMany({
      where: { user: { deletedAt: null } },
      select: { userId: true },
    });
    return [...new Set(rows.map((r) => r.userId))];
  }

  return [];
}
