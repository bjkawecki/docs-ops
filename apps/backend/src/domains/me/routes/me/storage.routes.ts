import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../../../../../generated/prisma/client.js';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../../auth/middleware.js';
import { canPinForScope } from '../../../pinned/permissions/pinnedPermissions.js';
import type { MeStorageQuery } from '../../schemas/me.js';
import { meStorageQuerySchema } from '../../schemas/me.js';

async function assertMeStorageScopeViewAllowed(
  prisma: PrismaClient,
  userId: string,
  query: MeStorageQuery
): Promise<{ status: 403; error: string } | undefined> {
  const scope = query.scope ?? 'personal';
  if (scope === 'team' && query.teamId) {
    const allowed = await canPinForScope(prisma, userId, 'team', query.teamId);
    if (!allowed) return { status: 403, error: 'Not allowed to view team storage' };
  } else if (scope === 'department' && query.departmentId) {
    const allowed = await canPinForScope(prisma, userId, 'department', query.departmentId);
    if (!allowed) return { status: 403, error: 'Not allowed to view department storage' };
  } else if (scope === 'company' && query.companyId) {
    const allowed = await canPinForScope(prisma, userId, 'company', query.companyId);
    if (!allowed) return { status: 403, error: 'Not allowed to view company storage' };
  }
  return undefined;
}

function registerMeStorageRoutes(app: FastifyInstance): void {
  app.get('/me/storage', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = meStorageQuerySchema.parse(request.query);
    const denied = await assertMeStorageScopeViewAllowed(prisma, userId, query);
    if (denied) return reply.status(denied.status).send({ error: denied.error });
    const scope = query.scope ?? 'personal';

    let userIds: string[];
    if (scope === 'personal') {
      userIds = [userId];
    } else if (scope === 'team' && query.teamId) {
      const members = await prisma.teamMember.findMany({
        where: { teamId: query.teamId },
        select: { userId: true },
      });
      userIds = members.map((member) => member.userId);
    } else if (scope === 'department' && query.departmentId) {
      const teams = await prisma.team.findMany({
        where: { departmentId: query.departmentId },
        select: { id: true },
      });
      const teamIds = teams.map((team) => team.id);
      const members = await prisma.teamMember.findMany({
        where: { teamId: { in: teamIds } },
        select: { userId: true },
      });
      userIds = [...new Set(members.map((member) => member.userId))];
    } else if (scope === 'company' && query.companyId) {
      const departments = await prisma.department.findMany({
        where: { companyId: query.companyId },
        select: { id: true },
      });
      const departmentIds = departments.map((department) => department.id);
      const teams = await prisma.team.findMany({
        where: { departmentId: { in: departmentIds } },
        select: { id: true },
      });
      const teamIds = teams.map((team) => team.id);
      const members = await prisma.teamMember.findMany({
        where: { teamId: { in: teamIds } },
        select: { userId: true },
      });
      userIds = [...new Set(members.map((member) => member.userId))];
    } else {
      userIds = [userId];
    }

    const where = { uploadedById: { in: userIds } };
    const [sumResult, attachmentCount, byUserRows] = await Promise.all([
      prisma.documentAttachment.aggregate({
        where,
        _sum: { sizeBytes: true },
      }),
      prisma.documentAttachment.count({ where }),
      scope !== 'personal'
        ? prisma.documentAttachment.groupBy({
            by: ['uploadedById'],
            where: { ...where, uploadedById: { not: null } },
            _sum: { sizeBytes: true },
            _count: true,
          })
        : Promise.resolve([]),
    ]);

    const usedBytes = Number(sumResult._sum.sizeBytes ?? 0);

    if (scope === 'personal') {
      return reply.send({ usedBytes, attachmentCount });
    }

    const byUserIds = new Set(
      (byUserRows as { uploadedById: string | null }[])
        .map((row) => row.uploadedById)
        .filter((id): id is string => id != null)
    );
    const users =
      byUserIds.size > 0
        ? await prisma.user.findMany({
            where: { id: { in: [...byUserIds] } },
            select: { id: true, name: true },
          })
        : [];
    const userMap = new Map(users.map((user) => [user.id, user.name]));
    const byUser = (
      byUserRows as {
        uploadedById: string | null;
        _sum: { sizeBytes: number | null };
        _count: number;
      }[]
    ).map((row) => ({
      userId: row.uploadedById!,
      name: userMap.get(row.uploadedById!) ?? '',
      usedBytes: row._sum.sizeBytes ?? 0,
    }));
    return reply.send({ usedBytes, attachmentCount, byUser });
  });
}

export { registerMeStorageRoutes };
