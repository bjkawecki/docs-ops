import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  requireAuthPreHandler,
  requireAdminPreHandler,
  IMPERSONATE_COOKIE_NAME,
} from '../auth/middleware.js';
import { hashPassword } from '../auth/password.js';
import {
  listUsersQuerySchema,
  createUserBodySchema,
  updateUserBodySchema,
  resetPasswordBodySchema,
  userIdParamSchema,
  impersonateBodySchema,
} from './schemas/admin.js';

const IMPERSONATE_COOKIE_MAX_AGE = 86400; // 1 Tag

const adminRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  const preAdmin = [requireAuthPreHandler, requireAdminPreHandler];

  /** POST /api/v1/admin/impersonate – Ansicht als Nutzer X (setzt Cookie, nur Admin). */
  app.post('/admin/impersonate', { preHandler: preAdmin }, async (request, reply) => {
    const body = impersonateBodySchema.parse(request.body);
    const target = await request.server.prisma.user.findFirst({
      where: { id: body.userId.trim(), deletedAt: null },
      select: { id: true },
    });
    if (!target) {
      return reply.status(404).send({ error: 'User not found or deactivated' });
    }
    reply.setCookie(IMPERSONATE_COOKIE_NAME, target.id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: IMPERSONATE_COOKIE_MAX_AGE,
    });
    return reply.status(204).send();
  });

  /** DELETE /api/v1/admin/impersonate – Impersonation beenden. */
  app.delete('/admin/impersonate', { preHandler: preAdmin }, async (_request, reply) => {
    reply.clearCookie(IMPERSONATE_COOKIE_NAME, { path: '/' });
    return reply.status(204).send();
  });

  /** GET /api/v1/admin/users – Nutzerliste (paginiert, Filter, Suche). */
  app.get('/admin/users', { preHandler: preAdmin }, async (request, reply) => {
    const query = listUsersQuerySchema.parse(request.query);
    const where: {
      deletedAt?: null | { not: null };
      OR?: Array<{
        name?: { contains: string; mode: 'insensitive' };
        email?: { contains: string; mode: 'insensitive' };
      }>;
    } = {};
    if (!query.includeDeactivated) {
      where.deletedAt = null;
    }
    if (query.search && query.search.trim() !== '') {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }
    const orderBy = query.sortBy
      ? ({ [query.sortBy]: query.sortOrder } as {
          name?: 'asc' | 'desc';
          email?: 'asc' | 'desc';
          isAdmin?: 'asc' | 'desc';
          deletedAt?: 'asc' | 'desc';
        })
      : { name: 'asc' as const };
    const [users, total] = await Promise.all([
      request.server.prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, isAdmin: true, deletedAt: true },
        orderBy,
        take: query.limit,
        skip: query.offset,
      }),
      request.server.prisma.user.count({ where }),
    ]);
    const userIds = users.map((u) => u.id);
    const [teamLeadRows, departmentLeadRows, companyLeadRows, teamMemberRows] = await Promise.all([
      request.server.prisma.teamLead.findMany({
        where: { userId: { in: userIds } },
        select: {
          userId: true,
          teamId: true,
          team: {
            select: { id: true, name: true, department: { select: { id: true, name: true } } },
          },
        },
      }),
      request.server.prisma.departmentLead.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, department: { select: { id: true, name: true } } },
      }),
      request.server.prisma.companyLead.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, company: { select: { id: true, name: true } } },
      }),
      request.server.prisma.teamMember.findMany({
        where: { userId: { in: userIds } },
        select: {
          userId: true,
          team: {
            select: { id: true, name: true, department: { select: { id: true, name: true } } },
          },
        },
      }),
    ]);
    const teamLeadSet = new Set(teamLeadRows.map((r) => r.userId));
    const departmentLeadSet = new Set(departmentLeadRows.map((r) => r.userId));
    const companyLeadSet = new Set(companyLeadRows.map((r) => r.userId));
    const teamsByUser = new Map<
      string,
      Array<{ id: string; name: string; departmentName: string }>
    >();
    const departmentsByUser = new Map<string, Array<{ id: string; name: string }>>();
    for (const r of teamMemberRows) {
      if (!r.team?.department) continue;
      const list = teamsByUser.get(r.userId) ?? [];
      if (!list.some((t) => t.id === r.team.id)) {
        list.push({ id: r.team.id, name: r.team.name, departmentName: r.team.department.name });
      }
      teamsByUser.set(r.userId, list);
      const deptList = departmentsByUser.get(r.userId) ?? [];
      if (!deptList.some((d) => d.id === r.team.department.id)) {
        deptList.push({ id: r.team.department.id, name: r.team.department.name });
      }
      departmentsByUser.set(r.userId, deptList);
    }
    for (const r of teamLeadRows) {
      if (!r.team?.department) continue;
      const list = teamsByUser.get(r.userId) ?? [];
      if (!list.some((t) => t.id === r.team.id)) {
        list.push({ id: r.team.id, name: r.team.name, departmentName: r.team.department.name });
      }
      teamsByUser.set(r.userId, list);
      const deptList = departmentsByUser.get(r.userId) ?? [];
      if (!deptList.some((d) => d.id === r.team.department.id)) {
        deptList.push({ id: r.team.department.id, name: r.team.department.name });
      }
      departmentsByUser.set(r.userId, deptList);
    }
    for (const r of departmentLeadRows) {
      const deptList = departmentsByUser.get(r.userId) ?? [];
      if (!deptList.some((d) => d.id === r.department.id)) {
        deptList.push({ id: r.department.id, name: r.department.name });
      }
      departmentsByUser.set(r.userId, deptList);
    }
    const items = users.map((u) => {
      const role = u.isAdmin
        ? ('Admin' as const)
        : companyLeadSet.has(u.id)
          ? ('Company Lead' as const)
          : departmentLeadSet.has(u.id)
            ? ('Department Lead' as const)
            : teamLeadSet.has(u.id)
              ? ('Team Lead' as const)
              : ('User' as const);
      return {
        ...u,
        role,
        teams: teamsByUser.get(u.id) ?? [],
        departments: departmentsByUser.get(u.id) ?? [],
      };
    });
    return reply.send({ items, total, limit: query.limit, offset: query.offset });
  });

  /** POST /api/v1/admin/users – Nutzer anlegen. */
  app.post('/admin/users', { preHandler: preAdmin }, async (request, reply) => {
    const body = createUserBodySchema.parse(request.body);
    const existing = await request.server.prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true },
    });
    if (existing) {
      return reply.status(409).send({ error: 'This email address is already in use.' });
    }
    const passwordHash = await hashPassword(body.password);
    const user = await request.server.prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash,
        isAdmin: body.isAdmin ?? false,
      },
      select: { id: true, name: true, email: true, isAdmin: true, deletedAt: true },
    });
    return reply.status(201).send(user);
  });

  /** PATCH /api/v1/admin/users/:userId – Nutzer bearbeiten / Deaktivierung / Reaktivierung. */
  app.patch<{ Params: { userId: string } }>(
    '/admin/users/:userId',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { userId } = userIdParamSchema.parse(request.params);
      const body = updateUserBodySchema.parse(request.body);

      const target = await request.server.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, isAdmin: true, deletedAt: true },
      });
      if (!target) {
        return reply.status(404).send({ error: 'User not found.' });
      }

      const adminCount = await request.server.prisma.user.count({
        where: { isAdmin: true, deletedAt: null },
      });
      if (body.isAdmin === false && target.isAdmin && adminCount <= 1) {
        return reply.status(403).send({
          error: 'The last administrator cannot be changed to a regular user.',
        });
      }
      if (
        body.deletedAt !== undefined &&
        body.deletedAt !== null &&
        target.isAdmin &&
        adminCount <= 1
      ) {
        return reply.status(403).send({
          error: 'The last administrator cannot be deactivated.',
        });
      }

      if (body.email !== undefined) {
        const existing = await request.server.prisma.user.findUnique({
          where: { email: body.email ?? '' },
          select: { id: true },
        });
        if (existing && existing.id !== userId) {
          return reply.status(409).send({ error: 'This email address is already in use.' });
        }
      }

      const data: {
        name?: string;
        email?: string | null;
        isAdmin?: boolean;
        deletedAt?: Date | null;
      } = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.email !== undefined) data.email = body.email;
      if (body.isAdmin !== undefined) data.isAdmin = body.isAdmin;
      if (body.deletedAt !== undefined) {
        data.deletedAt = body.deletedAt === null ? null : new Date(body.deletedAt);
      }

      if (data.deletedAt != null) {
        await request.server.prisma.session.deleteMany({ where: { userId } });
      }

      const updated = await request.server.prisma.user.update({
        where: { id: userId },
        data,
        select: { id: true, name: true, email: true, isAdmin: true, deletedAt: true },
      });
      return reply.send(updated);
    }
  );

  /** POST /api/v1/admin/users/:userId/reset-password – Admin setzt Passwort. */
  app.post<{ Params: { userId: string } }>(
    '/admin/users/:userId/reset-password',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { userId } = userIdParamSchema.parse(request.params);
      const body = resetPasswordBodySchema.parse(request.body);

      const user = await request.server.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, passwordHash: true },
      });
      if (!user) {
        return reply.status(404).send({ error: 'User not found.' });
      }
      if (user.passwordHash == null) {
        return reply.status(400).send({
          error: 'This user has no local login (SSO). Password cannot be set.',
        });
      }

      const passwordHash = await hashPassword(body.newPassword);
      await request.server.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      return reply.status(204).send();
    }
  );

  return Promise.resolve();
};

export default adminRoutes;
