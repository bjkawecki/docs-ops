import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../../app.js';
import { prisma } from '../../../db.js';
import { hashPassword } from '../../auth/services/password.js';
import { canReadContext } from './contextPermissions.js';
import {
  canReadOwnerScopeResolved,
  evaluateScopeCapability,
  isScopeLead,
  canViewScope,
} from './scopeVisibility.js';
import { loadActiveUser } from './userAccessPredicates.js';
import { canSeeDocumentInTrash } from '../../documents/permissions/canRead.js';
import { DOCUMENT_FOR_PERMISSION_INCLUDE } from '../../documents/permissions/documentLoad.js';

const TS = `scope-matrix-${Date.now()}`;
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

describe('scope permission matrix', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let companyId: string;
  let departmentId: string;
  let teamId: string;
  let contextTeamId: string;
  let companyLeadId: string;
  let teamMemberId: string;
  let outsiderId: string;
  let trashedDocId: string;

  beforeAll(async () => {
    app = await buildApp();
    const pw = await hashPassword(PASSWORD);
    const [company, companyLead, teamMember, outsider] = await Promise.all([
      prisma.company.create({ data: { name: `Matrix Co ${TS}` } }),
      prisma.user.create({
        data: { name: 'Co Lead', email: `co-lead-${TS}@test.de`, passwordHash: pw },
      }),
      prisma.user.create({
        data: { name: 'Member', email: `member-${TS}@test.de`, passwordHash: pw },
      }),
      prisma.user.create({
        data: { name: 'Outsider', email: `outsider-${TS}@test.de`, passwordHash: pw },
      }),
    ]);
    companyId = company.id;
    companyLeadId = companyLead.id;
    teamMemberId = teamMember.id;
    outsiderId = outsider.id;

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
    ]);

    const owner = await prisma.owner.create({ data: { teamId } });
    const ctx = await prisma.context.create({});
    await prisma.process.create({
      data: { name: `Proc ${TS}`, contextId: ctx.id, ownerId: owner.id },
    });
    contextTeamId = ctx.id;

    const doc = await prisma.document.create({
      data: {
        title: `Trash ${TS}`,
        contextId: ctx.id,
        createdById: companyLeadId,
        deletedAt: new Date(),
      },
    });
    trashedDocId = doc.id;
  });

  afterAll(async () => {
    await prisma.document.deleteMany({ where: { id: trashedDocId } });
    await prisma.process.deleteMany({ where: { contextId: contextTeamId } });
    await prisma.context.deleteMany({ where: { id: contextTeamId } });
    await prisma.owner.deleteMany({ where: { teamId } });
    await prisma.teamMember.deleteMany({ where: { teamId } });
    await prisma.companyLead.deleteMany({ where: { companyId } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.department.deleteMany({ where: { id: departmentId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    const userIds = [companyLeadId, teamMemberId, outsiderId];
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('company lead can view team and department via API', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `co-lead-${TS}@test.de`, password: PASSWORD },
    });
    expect(loginRes.statusCode).toBe(204);
    const cookie = cookieFrom(loginRes.headers['set-cookie']);

    const teamRes = await app.inject({
      method: 'GET',
      url: `/api/v1/teams/${teamId}`,
      headers: { cookie },
    });
    expect(teamRes.statusCode).toBe(200);

    const deptRes = await app.inject({
      method: 'GET',
      url: `/api/v1/departments/${departmentId}`,
      headers: { cookie },
    });
    expect(deptRes.statusCode).toBe(200);
  });

  it('company lead is scope lead; plain member is not', async () => {
    expect(await isScopeLead(prisma, companyLeadId, { type: 'company', companyId })).toBe(true);
    expect(await isScopeLead(prisma, teamMemberId, { type: 'company', companyId })).toBe(false);
    expect(await isScopeLead(prisma, teamMemberId, { type: 'team', teamId })).toBe(false);
    expect(await canViewScope(prisma, teamMemberId, { type: 'team', teamId })).toBe(true);
  });

  it('canReadContext aligns with canReadOwnerScope for company lead on team context', async () => {
    expect(await canReadContext(prisma, companyLeadId, contextTeamId)).toBe(true);
    const user = await loadActiveUser(prisma, companyLeadId);
    expect(user).not.toBeNull();
    expect(await canReadOwnerScopeResolved(prisma, user!, companyLeadId, { teamId })).toBe(true);
  });

  it('outsider cannot view team', async () => {
    expect(await canViewScope(prisma, outsiderId, { type: 'team', teamId })).toBe(false);
  });

  it('canSeeDocumentInTrash uses canViewScope for org-owned documents', async () => {
    const doc = await prisma.document.findUnique({
      where: { id: trashedDocId },
      include: DOCUMENT_FOR_PERMISSION_INCLUDE,
    });
    expect(doc).not.toBeNull();
    expect(await canSeeDocumentInTrash(prisma, companyLeadId, doc!)).toBe(true);
    expect(await canSeeDocumentInTrash(prisma, outsiderId, doc!)).toBe(false);
  });

  it('evaluateScopeCapability is the single hierarchy decision for view/lead', async () => {
    const coLead = await loadActiveUser(prisma, companyLeadId);
    const member = await loadActiveUser(prisma, teamMemberId);
    expect(coLead).not.toBeNull();
    expect(member).not.toBeNull();
    const hierarchy = { teamId, departmentId, companyId };
    expect(evaluateScopeCapability(coLead!, hierarchy, 'view')).toBe(true);
    expect(evaluateScopeCapability(coLead!, hierarchy, 'lead')).toBe(true);
    expect(evaluateScopeCapability(member!, hierarchy, 'view')).toBe(true);
    expect(evaluateScopeCapability(member!, hierarchy, 'lead')).toBe(false);
  });
});
