import type { FastifyReply } from 'fastify';
import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { canViewTeam } from '../permissions/assignmentPermissions.js';

export async function verifyTeamAndAssignmentUserExist(
  prisma: PrismaClient,
  teamId: string,
  bodyUserId: string,
  reply: FastifyReply
): Promise<boolean> {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) {
    void reply.status(404).send({ error: 'Team not found' });
    return false;
  }
  const user = await prisma.user.findUnique({
    where: { id: bodyUserId },
    select: { id: true, deletedAt: true },
  });
  if (!user || user.deletedAt) {
    void reply.status(404).send({ error: 'User not found' });
    return false;
  }
  return true;
}

/** GET members / team-leads: gleiche Permission + Pagination-Antwort. */
export async function sendTeamAssignmentListIfAllowed(
  prisma: PrismaClient,
  userId: string,
  teamId: string,
  query: { limit: number; offset: number },
  reply: FastifyReply,
  source: 'member' | 'lead'
): Promise<void> {
  const allowed = await canViewTeam(prisma, userId, teamId);
  if (!allowed) {
    void reply.status(403).send({ error: 'No access to this team' });
    return;
  }
  const { items, total } = await listTeamMembersOrLeadsPage(prisma, teamId, query, source);
  void reply.send({ items, total, limit: query.limit, offset: query.offset });
}

export async function listTeamMembersOrLeadsPage(
  prisma: PrismaClient,
  teamId: string,
  query: { limit: number; offset: number },
  source: 'member' | 'lead'
): Promise<{ items: Array<{ id: string; name: string }>; total: number }> {
  if (source === 'member') {
    const [rows, total] = await Promise.all([
      prisma.teamMember.findMany({
        where: { teamId },
        include: { user: { select: { id: true, name: true } } },
        take: query.limit,
        skip: query.offset,
        orderBy: { userId: 'asc' },
      }),
      prisma.teamMember.count({ where: { teamId } }),
    ]);
    return {
      items: rows.map((m) => ({ id: m.user.id, name: m.user.name })),
      total,
    };
  }
  const [rows, total] = await Promise.all([
    prisma.teamLead.findMany({
      where: { teamId },
      include: { user: { select: { id: true, name: true } } },
      take: query.limit,
      skip: query.offset,
      orderBy: { userId: 'asc' },
    }),
    prisma.teamLead.count({ where: { teamId } }),
  ]);
  return {
    items: rows.map((l) => ({ id: l.user.id, name: l.user.name })),
    total,
  };
}

/** Team-Mitglied anlegen nach Verify; bei Fehler wurde geantwortet. */
export async function createTeamMemberAfterVerify(
  prisma: PrismaClient,
  teamId: string,
  bodyUserId: string,
  reply: FastifyReply
): Promise<boolean> {
  if (!(await verifyTeamAndAssignmentUserExist(prisma, teamId, bodyUserId, reply))) return false;
  const existing = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: bodyUserId } },
  });
  if (existing) {
    void reply.status(409).send({ error: 'User is already a member' });
    return false;
  }
  await prisma.teamMember.create({
    data: { teamId, userId: bodyUserId },
  });
  return true;
}

/** Team-Lead anlegen (inkl. Mitgliedschaft); bei Fehler wurde geantwortet. */
export async function createTeamLeadAfterVerify(
  prisma: PrismaClient,
  teamId: string,
  bodyUserId: string,
  reply: FastifyReply
): Promise<boolean> {
  if (!(await verifyTeamAndAssignmentUserExist(prisma, teamId, bodyUserId, reply))) return false;
  const existing = await prisma.teamLead.findUnique({
    where: { teamId_userId: { teamId, userId: bodyUserId } },
  });
  if (existing) {
    void reply.status(409).send({ error: 'User is already team lead' });
    return false;
  }
  const isMember = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: bodyUserId } },
  });
  if (!isMember) {
    void reply.status(409).send({
      error: 'User must be a team member before being assigned as team lead.',
    });
    return false;
  }
  await prisma.teamLead.create({
    data: { teamId, userId: bodyUserId },
  });
  return true;
}
