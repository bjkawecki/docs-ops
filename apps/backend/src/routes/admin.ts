import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  requireAuthPreHandler,
  requireAdminPreHandler,
  IMPERSONATE_COOKIE_NAME,
  type RequestWithUser,
} from '../auth/middleware.js';
import { hashPassword } from '../auth/password.js';
import {
  listUsersQuerySchema,
  listUserDocumentsQuerySchema,
  createUserBodySchema,
  updateUserBodySchema,
  resetPasswordBodySchema,
  userIdParamSchema,
  impersonateBodySchema,
} from './schemas/admin.js';
import { setOwnerDisplayName, refreshContextOwnerDisplayForOwner } from '../contextOwnerDisplay.js';
import {
  companyIdParamSchema,
  departmentIdParamSchema,
  teamIdParamSchema,
} from './schemas/organisation.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { GrantRole } from '../../generated/prisma/client.js';

const IMPERSONATE_COOKIE_MAX_AGE = 86400; // 1 Tag

async function getOwnerScopeDocumentAndContextCounts(
  prisma: PrismaClient,
  ownerIds: string[]
): Promise<{ documentCount: number; processCount: number; projectCount: number }> {
  if (ownerIds.length === 0) {
    return { documentCount: 0, processCount: 0, projectCount: 0 };
  }
  const [processes, projects, processCount, projectCount] = await Promise.all([
    prisma.process.findMany({
      where: { ownerId: { in: ownerIds }, deletedAt: null },
      select: { contextId: true },
    }),
    prisma.project.findMany({
      where: { ownerId: { in: ownerIds }, deletedAt: null },
      select: { id: true, contextId: true },
    }),
    prisma.process.count({
      where: { ownerId: { in: ownerIds }, deletedAt: null },
    }),
    prisma.project.count({
      where: { ownerId: { in: ownerIds }, deletedAt: null },
    }),
  ]);
  const projectIds = projects.map((p) => p.id);
  const subcontexts =
    projectIds.length > 0
      ? await prisma.subcontext.findMany({
          where: { projectId: { in: projectIds } },
          select: { contextId: true },
        })
      : [];
  const contextIds = [
    ...processes.map((p) => p.contextId),
    ...projects.map((p) => p.contextId),
    ...subcontexts.map((s) => s.contextId),
  ];
  const documentCount =
    contextIds.length > 0
      ? await prisma.document.count({
          where: { contextId: { in: contextIds }, deletedAt: null },
        })
      : 0;
  return {
    documentCount,
    processCount,
    projectCount,
  };
}

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
        request.server.prisma.documentDraft.count({
          where: { userId },
        }),
      ]);
      return reply.send({
        storageBytesUsed: storageBytesUsed._sum.sizeBytes ?? 0,
        documentsAsWriterCount,
        draftsCount,
      });
    }
  );

  /** GET /api/v1/admin/companies/:companyId/stats – Kennzahlen für Company (Storage, Departments, Teams, Members, Documents, Processes, Projects). */
  app.get<{ Params: { companyId: string } }>(
    '/admin/companies/:companyId/stats',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { companyId } = companyIdParamSchema.parse(request.params);
      const prisma = request.server.prisma;
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });
      if (!company) {
        return reply.status(404).send({ error: 'Company not found.' });
      }
      const departments = await prisma.department.findMany({
        where: { companyId },
        select: { id: true },
      });
      const departmentIds = departments.map((d) => d.id);
      const teams = await prisma.team.findMany({
        where: { departmentId: { in: departmentIds } },
        select: { id: true },
      });
      const teamIds = teams.map((t) => t.id);
      const members = await prisma.teamMember.findMany({
        where: { teamId: { in: teamIds } },
        select: { userId: true },
      });
      const userIds = [...new Set(members.map((m) => m.userId))];
      const owners = await prisma.owner.findMany({
        where: { companyId },
        select: { id: true },
      });
      const ownerIds = owners.map((o) => o.id);
      const [storageResult, departmentCount, scopeCounts] = await Promise.all([
        userIds.length > 0
          ? prisma.documentAttachment.aggregate({
              where: { uploadedById: { in: userIds } },
              _sum: { sizeBytes: true },
            })
          : Promise.resolve({ _sum: { sizeBytes: null as number | null } }),
        prisma.department.count({ where: { companyId } }),
        getOwnerScopeDocumentAndContextCounts(prisma, ownerIds),
      ]);
      return reply.send({
        storageBytesUsed: storageResult._sum.sizeBytes ?? 0,
        departmentCount,
        teamCount: teams.length,
        memberCount: userIds.length,
        documentCount: scopeCounts.documentCount,
        processCount: scopeCounts.processCount,
        projectCount: scopeCounts.projectCount,
      });
    }
  );

  /** GET /api/v1/admin/departments/:departmentId/stats – Kennzahlen für Department (Storage, Teams, Members, Documents, Processes, Projects). */
  app.get<{ Params: { departmentId: string } }>(
    '/admin/departments/:departmentId/stats',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      const prisma = request.server.prisma;
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
        select: { id: true },
      });
      if (!department) {
        return reply.status(404).send({ error: 'Department not found.' });
      }
      const teams = await prisma.team.findMany({
        where: { departmentId },
        select: { id: true },
      });
      const teamIds = teams.map((t) => t.id);
      const members = await prisma.teamMember.findMany({
        where: { teamId: { in: teamIds } },
        select: { userId: true },
      });
      const userIds = [...new Set(members.map((m) => m.userId))];
      const owners = await prisma.owner.findMany({
        where: { departmentId },
        select: { id: true },
      });
      const ownerIds = owners.map((o) => o.id);
      const [storageResult, teamCount, memberCount, scopeCounts] = await Promise.all([
        userIds.length > 0
          ? prisma.documentAttachment.aggregate({
              where: { uploadedById: { in: userIds } },
              _sum: { sizeBytes: true },
            })
          : Promise.resolve({ _sum: { sizeBytes: null as number | null } }),
        prisma.team.count({ where: { departmentId } }),
        Promise.resolve(userIds.length),
        getOwnerScopeDocumentAndContextCounts(prisma, ownerIds),
      ]);
      return reply.send({
        storageBytesUsed: storageResult._sum.sizeBytes ?? 0,
        teamCount,
        memberCount,
        documentCount: scopeCounts.documentCount,
        processCount: scopeCounts.processCount,
        projectCount: scopeCounts.projectCount,
      });
    }
  );

  /** GET /api/v1/admin/teams/:teamId/members – Mitgliederliste (Admin, ohne canViewTeam). */
  app.get<{ Params: { teamId: string } }>(
    '/admin/teams/:teamId/members',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const limit = Math.min(Number(request.query?.limit) || 500, 500);
      const offset = Math.max(0, Number(request.query?.offset) || 0);
      const team = await request.server.prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true },
      });
      if (!team) {
        return reply.status(404).send({ error: 'Team not found.' });
      }
      const [items, total] = await Promise.all([
        request.server.prisma.teamMember.findMany({
          where: { teamId },
          include: { user: { select: { id: true, name: true } } },
          take: limit,
          skip: offset,
          orderBy: { userId: 'asc' },
        }),
        request.server.prisma.teamMember.count({ where: { teamId } }),
      ]);
      const list = items.map((m) => ({ id: m.user.id, name: m.user.name }));
      return reply.send({ items: list, total, limit, offset });
    }
  );

  /** GET /api/v1/admin/teams/:teamId/stats – Kennzahlen für Team (Storage, Members, Documents, Processes, Projects). */
  app.get<{ Params: { teamId: string } }>(
    '/admin/teams/:teamId/stats',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const prisma = request.server.prisma;
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true },
      });
      if (!team) {
        return reply.status(404).send({ error: 'Team not found.' });
      }
      const members = await prisma.teamMember.findMany({
        where: { teamId },
        select: { userId: true },
      });
      const userIds = members.map((m) => m.userId);
      const owners = await prisma.owner.findMany({
        where: { teamId },
        select: { id: true },
      });
      const ownerIds = owners.map((o) => o.id);
      const [storageResult, memberCount, scopeCounts] = await Promise.all([
        userIds.length > 0
          ? prisma.documentAttachment.aggregate({
              where: { uploadedById: { in: userIds } },
              _sum: { sizeBytes: true },
            })
          : Promise.resolve({ _sum: { sizeBytes: null as number | null } }),
        prisma.teamMember.count({ where: { teamId } }),
        getOwnerScopeDocumentAndContextCounts(prisma, ownerIds),
      ]);
      return reply.send({
        storageBytesUsed: storageResult._sum.sizeBytes ?? 0,
        memberCount,
        documentCount: scopeCounts.documentCount,
        processCount: scopeCounts.processCount,
        projectCount: scopeCounts.projectCount,
      });
    }
  );

  /** GET /api/v1/admin/departments/member-counts – Pro Department Anzahl verschiedener User (in allen Teams). */
  app.get('/admin/departments/member-counts', { preHandler: preAdmin }, async (request, reply) => {
    const rawIds = (request.query as { ids?: string }).ids;
    const departmentIds =
      typeof rawIds === 'string' && rawIds.trim()
        ? rawIds
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : null;
    const teamMembers = await request.server.prisma.teamMember.findMany({
      where: departmentIds ? { team: { departmentId: { in: departmentIds } } } : undefined,
      select: { userId: true, team: { select: { departmentId: true } } },
    });
    const byDept = new Map<string, Set<string>>();
    for (const m of teamMembers) {
      const deptId = m.team.departmentId;
      if (!byDept.has(deptId)) byDept.set(deptId, new Set());
      byDept.get(deptId)!.add(m.userId);
    }
    const result: Record<string, number> = {};
    for (const [deptId, userIds] of byDept) {
      result[deptId] = userIds.size;
    }
    return reply.send(result);
  });

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

export default adminRoutes;
