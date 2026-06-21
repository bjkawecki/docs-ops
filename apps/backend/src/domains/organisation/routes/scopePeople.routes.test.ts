import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../../app.js';
import { prisma } from '../../../db.js';
import { hashPassword } from '../../auth/services/password.js';

const TS = `scope-people-${Date.now()}`;
const PASSWORD = 'testpass';

function cookieFrom(setCookie: string | string[] | undefined): string {
  if (Array.isArray(setCookie))
    return setCookie
      .map((s) => s.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');
  if (typeof setCookie === 'string') return setCookie.split(';')[0].trim();
  return '';
}

async function login(email: string): Promise<string> {
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: PASSWORD },
  });
  expect(loginRes.statusCode).toBe(204);
  return cookieFrom(loginRes.headers['set-cookie']);
}

let app: Awaited<ReturnType<typeof buildApp>>;

describe('scope people routes', () => {
  let companyId: string;
  let departmentId: string;
  let teamId: string;
  let companyLeadId: string;
  let teamMemberId: string;
  let outsiderId: string;
  let teamLeadId: string;

  beforeAll(async () => {
    app = await buildApp();
    const pw = await hashPassword(PASSWORD);
    const [company, companyLead, teamMember, outsider, teamLead] = await Promise.all([
      prisma.company.create({ data: { name: `People Co ${TS}` } }),
      prisma.user.create({
        data: { name: 'Co Lead', email: `co-lead-${TS}@test.de`, passwordHash: pw },
      }),
      prisma.user.create({
        data: {
          name: 'Member',
          email: `member-${TS}@test.de`,
          passwordHash: pw,
          lastActiveAt: new Date(),
        },
      }),
      prisma.user.create({
        data: { name: 'Outsider', email: `outsider-${TS}@test.de`, passwordHash: pw },
      }),
      prisma.user.create({
        data: { name: 'Team Lead', email: `team-lead-${TS}@test.de`, passwordHash: pw },
      }),
    ]);
    companyId = company.id;
    companyLeadId = companyLead.id;
    teamMemberId = teamMember.id;
    outsiderId = outsider.id;
    teamLeadId = teamLead.id;

    const department = await prisma.department.create({
      data: { name: `Dept ${TS}`, companyId },
    });
    departmentId = department.id;

    const team = await prisma.team.create({
      data: { name: `Team ${TS}`, departmentId },
    });
    teamId = team.id;

    await Promise.all([
      prisma.companyLead.create({ data: { companyId, userId: companyLeadId } }),
      prisma.teamMember.create({ data: { teamId, userId: teamMemberId } }),
      prisma.teamLead.create({ data: { teamId, userId: teamLeadId } }),
    ]);
  });

  afterAll(async () => {
    await prisma.teamLead.deleteMany({ where: { teamId } });
    await prisma.teamMember.deleteMany({ where: { teamId } });
    await prisma.companyLead.deleteMany({ where: { companyId } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.department.deleteMany({ where: { id: departmentId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    const userIds = [companyLeadId, teamMemberId, outsiderId, teamLeadId];
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('team member can list team people with presence', async () => {
    const cookie = await login(`member-${TS}@test.de`);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/teams/${teamId}/people`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: { id: string; name: string; roles?: string[]; isOnline: boolean }[];
      total: number;
      onlineCount: number;
    };
    expect(body.total).toBe(2);
    expect(body.onlineCount).toBeGreaterThanOrEqual(1);
    const member = body.items.find((p) => p.id === teamMemberId);
    expect(member?.isOnline).toBe(true);
    const lead = body.items.find((p) => p.id === teamLeadId);
    expect(lead?.roles).toContain('lead');
  });

  it('outsider cannot list team people', async () => {
    const cookie = await login(`outsider-${TS}@test.de`);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/teams/${teamId}/people`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('team member can list department people with team member names', async () => {
    const cookie = await login(`member-${TS}@test.de`);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/departments/${departmentId}/people`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      teams: { members: { name: string }[]; teamLeads: { name: string }[] }[];
      summary: { peopleCount: number; teamCount: number };
    };
    expect(body.summary.teamCount).toBe(1);
    expect(body.summary.peopleCount).toBe(2);
    expect(body.teams[0]?.members.some((m) => m.name === 'Member')).toBe(true);
    expect(body.teams[0]?.teamLeads.some((l) => l.name === 'Team Lead')).toBe(true);
  });

  it('plain member cannot list company people', async () => {
    const cookie = await login(`member-${TS}@test.de`);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${companyId}/people`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('company lead gets org overview without member names in teams', async () => {
    const cookie = await login(`co-lead-${TS}@test.de`);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${companyId}/people`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      companyLeads: { name: string }[];
      departments: {
        teams: Record<string, unknown>[];
        departmentLeads: unknown[];
      }[];
      summary: { departmentCount: number; peopleCount: number };
    };
    expect(body.companyLeads.some((l) => l.name === 'Co Lead')).toBe(true);
    expect(body.summary.departmentCount).toBe(1);
    expect(body.summary.peopleCount).toBeGreaterThanOrEqual(3);
    const teamEntry = body.departments[0]?.teams[0];
    expect(teamEntry).toBeDefined();
    expect(teamEntry).not.toHaveProperty('members');
    expect(teamEntry).toHaveProperty('peopleCount');
    expect(teamEntry).toHaveProperty('onlineCount');
  });
});
