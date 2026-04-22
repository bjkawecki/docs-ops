import type { FastifyReply } from 'fastify';
import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { canViewCompany, canViewDepartment } from '../permissions/assignmentPermissions.js';

export async function listCompanyDepartmentsPaged(
  prisma: PrismaClient,
  userId: string,
  companyId: string,
  query: { limit: number; offset: number },
  reply: FastifyReply
): Promise<void> {
  const allowed = await canViewCompany(prisma, userId, companyId);
  if (!allowed) {
    void reply.status(403).send({ error: 'Permission denied to view this company' });
    return;
  }
  const [items, total] = await Promise.all([
    prisma.department.findMany({
      where: { companyId },
      include: { teams: true },
      take: query.limit,
      skip: query.offset,
      orderBy: { name: 'asc' },
    }),
    prisma.department.count({ where: { companyId } }),
  ]);
  void reply.send({ items, total, limit: query.limit, offset: query.offset });
}

export async function listDepartmentTeamsPaged(
  prisma: PrismaClient,
  userId: string,
  departmentId: string,
  query: { limit: number; offset: number },
  reply: FastifyReply
): Promise<void> {
  const allowed = await canViewDepartment(prisma, userId, departmentId);
  if (!allowed) {
    void reply.status(403).send({ error: 'Permission denied to view this department' });
    return;
  }
  const [items, total] = await Promise.all([
    prisma.team.findMany({
      where: { departmentId },
      include: { department: true },
      take: query.limit,
      skip: query.offset,
      orderBy: { name: 'asc' },
    }),
    prisma.team.count({ where: { departmentId } }),
  ]);
  void reply.send({ items, total, limit: query.limit, offset: query.offset });
}
