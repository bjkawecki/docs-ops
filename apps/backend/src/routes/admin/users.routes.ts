import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  requireAuthPreHandler,
  requireAdminPreHandler,
  type RequestWithUser,
} from '../../auth/middleware.js';
import { hashPassword } from '../../auth/password.js';
import {
  createUserBodySchema,
  listUserDocumentsQuerySchema,
  listUsersQuerySchema,
  resetPasswordBodySchema,
  updateUserBodySchema,
  userIdParamSchema,
} from '../schemas/admin/users.js';
import {
  refreshContextOwnerDisplayForOwner,
  setOwnerDisplayName,
} from '../../services/contexts/contextOwnerDisplay.js';
import { GrantRole } from '../../../generated/prisma/client.js';

const adminUsersRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  const preAdmin = [requireAuthPreHandler, requireAdminPreHandler];

  /** GET /api/v1/admin/users – Nutzerliste (paginiert, Filter, Suche, Sortierung). */
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

    const sortByRelation =
      query.sortBy === 'teams' || query.sortBy === 'departments' || query.sortBy === 'role';
    const CAP_FOR_RELATION_SORT = 5000;

    let users: Array<{
      id: string;
      name: string;
      email: string | null;
      isAdmin: boolean;
      deletedAt: string | null;
    }>;
    let total: number;

    if (sortByRelation) {
      const [usersAll, totalCount] = await Promise.all([
        request.server.prisma.user.findMany({
          where,
          select: { id: true, name: true, email: true, isAdmin: true, deletedAt: true },
          orderBy: { name: 'asc' },
          take: CAP_FOR_RELATION_SORT,
        }),
        request.server.prisma.user.count({ where }),
      ]);
      users = usersAll;
      total = totalCount > CAP_FOR_RELATION_SORT ? CAP_FOR_RELATION_SORT : totalCount;
    } else {
      const dbSortField = query.sortBy === 'role' ? undefined : query.sortBy;
      const orderBy = dbSortField
        ? ({ [dbSortField]: query.sortOrder } as {
            name?: 'asc' | 'desc';
            email?: 'asc' | 'desc';
            isAdmin?: 'asc' | 'desc';
            deletedAt?: 'asc' | 'desc';
          })
        : { name: 'asc' as const };
      const [usersPage, totalCount] = await Promise.all([
        request.server.prisma.user.findMany({
          where,
          select: { id: true, name: true, email: true, isAdmin: true, deletedAt: true },
          orderBy,
          take: query.limit,
          skip: query.offset,
        }),
        request.server.prisma.user.count({ where }),
      ]);
      users = usersPage;
      total = totalCount;
    }

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
    const departmentsAsLeadByUser = new Map<string, Array<{ id: string; name: string }>>();
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
      const leadList = departmentsAsLeadByUser.get(r.userId) ?? [];
      leadList.push({ id: r.department.id, name: r.department.name });
      departmentsAsLeadByUser.set(r.userId, leadList);
    }
    let items = users.map((u) => {
      const role = u.isAdmin
        ? ('Admin' as const)
        : companyLeadSet.has(u.id)
          ? ('Company Lead' as const)
          : departmentLeadSet.has(u.id)
            ? ('Department Lead' as const)
            : teamLeadSet.has(u.id)
              ? ('Team Lead' as const)
              : ('User' as const);
      const teamsRaw = teamsByUser.get(u.id) ?? [];
      const teams = teamsRaw.map((t) => ({
        ...t,
        isLead: teamLeadRows.some((r) => r.userId === u.id && r.teamId === t.id),
      }));
      const departments = departmentsByUser.get(u.id) ?? [];
      const departmentsAsLead = departmentsAsLeadByUser.get(u.id) ?? [];
      return {
        ...u,
        role,
        teams,
        departments,
        departmentsAsLead,
      };
    });

    if (sortByRelation) {
      const dir = query.sortOrder === 'asc' ? 1 : -1;
      if (query.sortBy === 'role') {
        items.sort((a, b) => dir * (a.role < b.role ? -1 : a.role > b.role ? 1 : 0));
      } else {
        const key = query.sortBy === 'teams' ? 'teams' : 'departments';
        items.sort((a, b) => {
          const aStr =
            key === 'teams'
              ? [...a.teams]
                  .map((t) => t.name)
                  .sort()
                  .join(', ') || '\uFFFF'
              : [...a.departments]
                  .map((d) => d.name)
                  .sort()
                  .join(', ') || '\uFFFF';
          const bStr =
            key === 'teams'
              ? [...b.teams]
                  .map((t) => t.name)
                  .sort()
                  .join(', ') || '\uFFFF'
              : [...b.departments]
                  .map((d) => d.name)
                  .sort()
                  .join(', ') || '\uFFFF';
          return dir * (aStr < bStr ? -1 : aStr > bStr ? 1 : 0);
        });
      }
      items = items.slice(query.offset, query.offset + query.limit);
    }

    const activeAdminCount = await request.server.prisma.user.count({
      where: { isAdmin: true, deletedAt: null },
    });

    return reply.send({
      items,
      total,
      limit: query.limit,
      offset: query.offset,
      activeAdminCount,
    });
  });

  /** GET /api/v1/admin/users/:userId/stats – Kennzahlen für User-Detail. */
  app.get<{ Params: { userId: string } }>(
    '/admin/users/:userId/stats',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { userId } = userIdParamSchema.parse(request.params);
      const user = await request.server.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        return reply.status(404).send({ error: 'User not found.' });
      }
      const [storageBytesUsed, documentsAsWriterCount, draftsCount] = await Promise.all([
        request.server.prisma.documentAttachment.aggregate({
          where: { uploadedById: userId },
          _sum: { sizeBytes: true },
        }),
        request.server.prisma.documentGrantUser.count({
          where: { userId, role: GrantRole.Write },
        }),
        request.server.prisma.document.count({
          where: {
            createdById: userId,
            publishedAt: null,
            deletedAt: null,
            archivedAt: null,
          },
        }),
      ]);
      return reply.send({
        storageBytesUsed: storageBytesUsed._sum.sizeBytes ?? 0,
        documentsAsWriterCount,
        draftsCount,
      });
    }
  );

  /** GET /api/v1/admin/users/:userId/documents – Dokumente, bei denen User Writer ist (direkte User-Grants). */
  app.get<{ Params: { userId: string } }>(
    '/admin/users/:userId/documents',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { userId } = userIdParamSchema.parse(request.params);
      const query = listUserDocumentsQuerySchema.parse(request.query);
      const user = await request.server.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        return reply.status(404).send({ error: 'User not found.' });
      }
      const whereDoc = {
        deletedAt: null,
        grantUser: {
          some: { userId, role: GrantRole.Write },
        },
        ...(query.search?.trim() && {
          title: { contains: query.search.trim(), mode: 'insensitive' as const },
        }),
      };
      const [items, total] = await Promise.all([
        request.server.prisma.document.findMany({
          where: whereDoc,
          select: { id: true, title: true },
          orderBy: { title: 'asc' },
          take: query.limit,
          skip: query.offset,
        }),
        request.server.prisma.document.count({ where: whereDoc }),
      ]);
      return reply.send({
        items,
        total,
        limit: query.limit,
        offset: query.offset,
      });
    }
  );

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
      if (data.name !== undefined) {
        const prisma = request.server.prisma;
        const owners = await prisma.owner.findMany({
          where: { ownerUserId: userId },
          select: { id: true },
        });
        for (const o of owners) {
          await setOwnerDisplayName(prisma, o.id);
          await refreshContextOwnerDisplayForOwner(prisma, o.id);
        }
      }
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

  /** POST /api/v1/admin/users/:userId/reset-password/trigger – Admin löst Passwort-Reset aus (z. B. E-Mail). */
  app.post<{ Params: { userId: string } }>(
    '/admin/users/:userId/reset-password/trigger',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { userId } = userIdParamSchema.parse(request.params);

      const user = await request.server.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, passwordHash: true },
      });
      if (!user) {
        return reply.status(404).send({ error: 'User not found.' });
      }
      if (user.passwordHash == null) {
        return reply.status(400).send({
          error: 'This user has no local login (SSO). Password reset is not applicable.',
        });
      }

      // Placeholder: später z. B. Reset-Token anlegen und E-Mail versenden
      return reply.status(204).send();
    }
  );

  /** DELETE /api/v1/admin/users/:userId – Nutzer endgültig löschen (nur Admin). Irreversibel. */
  app.delete<{ Params: { userId: string } }>(
    '/admin/users/:userId',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { userId } = userIdParamSchema.parse(request.params);
      const currentUserId = (request as RequestWithUser).user.id;
      if (currentUserId === userId) {
        return reply.status(403).send({ error: 'You cannot delete your own user account.' });
      }

      const user = await request.server.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        return reply.status(404).send({ error: 'User not found.' });
      }

      await request.server.prisma.session.deleteMany({ where: { userId } });
      await request.server.prisma.user.delete({ where: { id: userId } });
      return reply.status(204).send();
    }
  );

  return Promise.resolve();
};

export default adminUsersRoutes;
