import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { isUserOnline } from '../../me/services/presenceConfig.js';

const userPresenceSelect = { id: true, name: true, lastActiveAt: true } as const;

export type PersonRow = {
  id: string;
  name: string;
  roles?: ('member' | 'lead')[];
  isOnline: boolean;
  lastActiveAt: string | null;
};

type UserPresenceRow = {
  id: string;
  name: string;
  lastActiveAt: Date | null;
};

function toPersonRow(
  user: UserPresenceRow,
  roles?: ('member' | 'lead')[],
  now = new Date()
): PersonRow {
  return {
    id: user.id,
    name: user.name,
    ...(roles != null && roles.length > 0 ? { roles } : {}),
    isOnline: isUserOnline(user.lastActiveAt, now),
    lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
  };
}

function countOnline(users: Iterable<UserPresenceRow>, now = new Date()): number {
  let n = 0;
  for (const u of users) {
    if (isUserOnline(u.lastActiveAt, now)) n += 1;
  }
  return n;
}

function uniqueUsersById(users: UserPresenceRow[]): UserPresenceRow[] {
  const byId = new Map<string, UserPresenceRow>();
  for (const u of users) byId.set(u.id, u);
  return [...byId.values()];
}

export async function getTeamPeople(prisma: PrismaClient, teamId: string) {
  const now = new Date();
  const [members, leads] = await Promise.all([
    prisma.teamMember.findMany({
      where: { teamId },
      include: { user: { select: userPresenceSelect } },
      orderBy: { user: { name: 'asc' } },
    }),
    prisma.teamLead.findMany({
      where: { teamId },
      include: { user: { select: userPresenceSelect } },
      orderBy: { user: { name: 'asc' } },
    }),
  ]);

  const byId = new Map<string, { user: UserPresenceRow; roles: Set<'member' | 'lead'> }>();
  for (const m of members) {
    const roles = new Set<'member' | 'lead'>(['member']);
    byId.set(m.user.id, { user: m.user, roles });
  }
  for (const l of leads) {
    const existing = byId.get(l.user.id);
    if (existing) {
      existing.roles.add('lead');
    } else {
      byId.set(l.user.id, { user: l.user, roles: new Set(['lead']) });
    }
  }

  const items = [...byId.values()]
    .map(({ user, roles }) => toPersonRow(user, [...roles], now))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    items,
    total: items.length,
    onlineCount: items.filter((p) => p.isOnline).length,
  };
}

export async function getDepartmentPeople(prisma: PrismaClient, departmentId: string) {
  const now = new Date();
  const [departmentLeadRows, teams] = await Promise.all([
    prisma.departmentLead.findMany({
      where: { departmentId },
      include: { user: { select: userPresenceSelect } },
      orderBy: { user: { name: 'asc' } },
    }),
    prisma.team.findMany({
      where: { departmentId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const departmentLeads = departmentLeadRows.map((r) => toPersonRow(r.user, ['lead'], now));

  const teamIds = teams.map((t) => t.id);
  const [allMembers, allLeads] =
    teamIds.length > 0
      ? await Promise.all([
          prisma.teamMember.findMany({
            where: { teamId: { in: teamIds } },
            include: { user: { select: userPresenceSelect } },
          }),
          prisma.teamLead.findMany({
            where: { teamId: { in: teamIds } },
            include: { user: { select: userPresenceSelect } },
          }),
        ])
      : [[], []];

  const membersByTeam = new Map<string, typeof allMembers>();
  const leadsByTeam = new Map<string, typeof allLeads>();
  for (const m of allMembers) {
    const list = membersByTeam.get(m.teamId) ?? [];
    list.push(m);
    membersByTeam.set(m.teamId, list);
  }
  for (const l of allLeads) {
    const list = leadsByTeam.get(l.teamId) ?? [];
    list.push(l);
    leadsByTeam.set(l.teamId, list);
  }

  const teamsOut = teams.map((team) => {
    const memberRows = membersByTeam.get(team.id) ?? [];
    const leadRows = leadsByTeam.get(team.id) ?? [];
    const byId = new Map<string, { user: UserPresenceRow; roles: Set<'member' | 'lead'> }>();
    for (const m of memberRows) {
      byId.set(m.user.id, { user: m.user, roles: new Set(['member']) });
    }
    for (const l of leadRows) {
      const existing = byId.get(l.user.id);
      if (existing) existing.roles.add('lead');
      else byId.set(l.user.id, { user: l.user, roles: new Set(['lead']) });
    }
    const people = [...byId.values()];
    return {
      id: team.id,
      name: team.name,
      teamLeads: people
        .filter((p) => p.roles.has('lead'))
        .map((p) => toPersonRow(p.user, ['lead'], now))
        .sort((a, b) => a.name.localeCompare(b.name)),
      members: people
        .filter((p) => p.roles.has('member'))
        .map((p) => toPersonRow(p.user, ['member'], now))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

  const allPeople = uniqueUsersById([
    ...departmentLeadRows.map((r) => r.user),
    ...allMembers.map((m) => m.user),
    ...allLeads.map((l) => l.user),
  ]);

  return {
    departmentLeads,
    teams: teamsOut,
    summary: {
      peopleCount: allPeople.length,
      onlineCount: countOnline(allPeople, now),
      teamCount: teams.length,
    },
  };
}

export async function getCompanyPeople(prisma: PrismaClient, companyId: string) {
  const now = new Date();
  const [companyLeadRows, departments] = await Promise.all([
    prisma.companyLead.findMany({
      where: { companyId },
      include: { user: { select: userPresenceSelect } },
      orderBy: { user: { name: 'asc' } },
    }),
    prisma.department.findMany({
      where: { companyId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const companyLeads = companyLeadRows.map((r) => toPersonRow(r.user, ['lead'], now));

  const departmentIds = departments.map((d) => d.id);
  const teams =
    departmentIds.length > 0
      ? await prisma.team.findMany({
          where: { departmentId: { in: departmentIds } },
          select: { id: true, name: true, departmentId: true },
          orderBy: { name: 'asc' },
        })
      : [];

  const teamIds = teams.map((t) => t.id);
  const [deptLeadRows, allMembers, allLeads] = await Promise.all([
    departmentIds.length > 0
      ? prisma.departmentLead.findMany({
          where: { departmentId: { in: departmentIds } },
          include: { user: { select: userPresenceSelect } },
        })
      : Promise.resolve([]),
    teamIds.length > 0
      ? prisma.teamMember.findMany({
          where: { teamId: { in: teamIds } },
          include: { user: { select: userPresenceSelect } },
        })
      : Promise.resolve([]),
    teamIds.length > 0
      ? prisma.teamLead.findMany({
          where: { teamId: { in: teamIds } },
          include: { user: { select: userPresenceSelect } },
        })
      : Promise.resolve([]),
  ]);

  const deptLeadsByDept = new Map<string, UserPresenceRow[]>();
  for (const r of deptLeadRows) {
    const list = deptLeadsByDept.get(r.departmentId) ?? [];
    list.push(r.user);
    deptLeadsByDept.set(r.departmentId, list);
  }

  const usersByTeam = new Map<string, UserPresenceRow[]>();
  for (const m of allMembers) {
    const list = usersByTeam.get(m.teamId) ?? [];
    list.push(m.user);
    usersByTeam.set(m.teamId, list);
  }
  for (const l of allLeads) {
    const list = usersByTeam.get(l.teamId) ?? [];
    list.push(l.user);
    usersByTeam.set(l.teamId, list);
  }

  const teamsByDept = new Map<string, typeof teams>();
  for (const t of teams) {
    const list = teamsByDept.get(t.departmentId) ?? [];
    list.push(t);
    teamsByDept.set(t.departmentId, list);
  }

  const departmentsOut = departments.map((dept) => {
    const deptTeams = teamsByDept.get(dept.id) ?? [];
    const deptLeadUsers = (deptLeadsByDept.get(dept.id) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const deptPeople = uniqueUsersById([
      ...deptLeadUsers,
      ...deptTeams.flatMap((t) => usersByTeam.get(t.id) ?? []),
    ]);
    return {
      id: dept.id,
      name: dept.name,
      departmentLeads: deptLeadUsers.map((u) => toPersonRow(u, ['lead'], now)),
      teams: deptTeams.map((team) => {
        const people = uniqueUsersById(usersByTeam.get(team.id) ?? []);
        return {
          id: team.id,
          name: team.name,
          peopleCount: people.length,
          onlineCount: countOnline(people, now),
        };
      }),
      peopleCount: deptPeople.length,
      onlineCount: countOnline(deptPeople, now),
      teamCount: deptTeams.length,
    };
  });

  const allCompanyPeople = uniqueUsersById([
    ...companyLeadRows.map((r) => r.user),
    ...deptLeadRows.map((r) => r.user),
    ...allMembers.map((m) => m.user),
    ...allLeads.map((l) => l.user),
  ]);

  return {
    companyLeads,
    departments: departmentsOut,
    summary: {
      peopleCount: allCompanyPeople.length,
      onlineCount: countOnline(allCompanyPeople, now),
      departmentCount: departments.length,
    },
  };
}
