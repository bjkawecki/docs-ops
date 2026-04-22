import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../db.js';
import { hashPassword } from '../../auth/services/password.js';
import { canPinForScope, getVisiblePinnedScopeIds } from '../permissions/pinnedPermissions.js';

const TS = `pinperm-${Date.now()}`;

describe('Pinned permissions (canPinForScope, getVisiblePinnedScopeIds)', () => {
  let companyId: string;
  let departmentId: string;
  let teamId: string;
  let adminId: string;
  let teamLeadId: string;
  let departmentLeadId: string;
  let companyLeadId: string;
  let normalMemberId: string;
  let deletedUserId: string;

  beforeAll(async () => {
    const pw = await hashPassword('test');
    const [company, admin, teamLead, deptLead, companyLead, normalMember, deletedUser] =
      await Promise.all([
        prisma.company.create({ data: { name: `Company ${TS}` } }),
        prisma.user.create({
          data: {
            name: 'Admin',
            email: `admin-${TS}@test.de`,
            passwordHash: pw,
            isAdmin: true,
          },
        }),
        prisma.user.create({
          data: {
            name: 'Team Lead',
            email: `tlead-${TS}@test.de`,
            passwordHash: pw,
          },
        }),
        prisma.user.create({
          data: {
            name: 'Dept Lead',
            email: `dlead-${TS}@test.de`,
            passwordHash: pw,
          },
        }),
        prisma.user.create({
          data: {
            name: 'Company Lead',
            email: `clead-${TS}@test.de`,
            passwordHash: pw,
          },
        }),
        prisma.user.create({
          data: {
            name: 'Member',
            email: `member-${TS}@test.de`,
            passwordHash: pw,
          },
        }),
        prisma.user.create({
          data: {
            name: 'Deleted',
            email: `deleted-${TS}@test.de`,
            passwordHash: pw,
            deletedAt: new Date(),
          },
        }),
      ]);

    companyId = company.id;
    adminId = admin.id;
    teamLeadId = teamLead.id;
    departmentLeadId = deptLead.id;
    companyLeadId = companyLead.id;
    normalMemberId = normalMember.id;
    deletedUserId = deletedUser.id;

    const dept = await prisma.department.create({
      data: { name: `Dept ${TS}`, companyId },
    });
    departmentId = dept.id;
    const team = await prisma.team.create({
      data: { name: `Team ${TS}`, departmentId },
    });
    teamId = team.id;

    await Promise.all([
      prisma.teamMember.create({ data: { teamId, userId: normalMemberId } }),
      prisma.teamMember.create({ data: { teamId, userId: teamLeadId } }),
      prisma.teamLead.create({ data: { teamId, userId: teamLeadId } }),
      prisma.departmentLead.create({ data: { departmentId, userId: departmentLeadId } }),
      prisma.companyLead.create({ data: { companyId, userId: companyLeadId } }),
    ]);
  });

  afterAll(async () => {
    if (teamId) {
      await prisma.teamLead.deleteMany({ where: { teamId } });
      await prisma.teamMember.deleteMany({ where: { teamId } });
      await prisma.team.deleteMany({ where: { id: teamId } });
    }
    if (departmentId) await prisma.departmentLead.deleteMany({ where: { departmentId } });
    if (departmentId) await prisma.department.deleteMany({ where: { id: departmentId } });
    if (companyId) {
      await prisma.companyLead.deleteMany({ where: { companyId } });
      await prisma.company.deleteMany({ where: { id: companyId } });
    }
    const userIds = [
      adminId,
      teamLeadId,
      departmentLeadId,
      companyLeadId,
      normalMemberId,
      deletedUserId,
    ].filter((id): id is string => id != null);
    if (userIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  describe('canPinForScope', () => {
    it('Admin darf für beliebigen Scope pin/unpin', async () => {
      expect(await canPinForScope(prisma, adminId, 'team', teamId)).toBe(true);
      expect(await canPinForScope(prisma, adminId, 'department', departmentId)).toBe(true);
      expect(await canPinForScope(prisma, adminId, 'company', companyId)).toBe(true);
    });

    it('Team Lead darf nur für eigenes Team pin/unpin', async () => {
      expect(await canPinForScope(prisma, teamLeadId, 'team', teamId)).toBe(true);
      expect(await canPinForScope(prisma, teamLeadId, 'department', departmentId)).toBe(false);
      expect(await canPinForScope(prisma, teamLeadId, 'company', companyId)).toBe(false);
    });

    it('Department Lead darf für eigene Abteilung pin/unpin', async () => {
      expect(await canPinForScope(prisma, departmentLeadId, 'department', departmentId)).toBe(true);
      expect(await canPinForScope(prisma, departmentLeadId, 'team', teamId)).toBe(false);
      expect(await canPinForScope(prisma, departmentLeadId, 'company', companyId)).toBe(false);
    });

    it('Company Lead darf für Company pin/unpin', async () => {
      expect(await canPinForScope(prisma, companyLeadId, 'company', companyId)).toBe(true);
      expect(await canPinForScope(prisma, companyLeadId, 'team', teamId)).toBe(false);
      expect(await canPinForScope(prisma, companyLeadId, 'department', departmentId)).toBe(false);
    });

    it('Normales Mitglied darf nicht pin/unpin', async () => {
      expect(await canPinForScope(prisma, normalMemberId, 'team', teamId)).toBe(false);
      expect(await canPinForScope(prisma, normalMemberId, 'department', departmentId)).toBe(false);
      expect(await canPinForScope(prisma, normalMemberId, 'company', companyId)).toBe(false);
    });

    it('Gelöschter User darf nicht pin/unpin', async () => {
      expect(await canPinForScope(prisma, deletedUserId, 'team', teamId)).toBe(false);
    });
  });

  describe('getVisiblePinnedScopeIds', () => {
    it('Admin sieht alle Scopes', async () => {
      const scopes = await getVisiblePinnedScopeIds(prisma, adminId);
      expect(scopes.teamIds).toContain(teamId);
      expect(scopes.departmentIds).toContain(departmentId);
      expect(scopes.companyIds).toContain(companyId);
    });

    it('Team-Mitglied sieht eigenes Team, Department und Company', async () => {
      const scopes = await getVisiblePinnedScopeIds(prisma, normalMemberId);
      expect(scopes.teamIds).toContain(teamId);
      expect(scopes.departmentIds).toContain(departmentId);
      expect(scopes.companyIds).toContain(companyId);
    });

    it('Team Lead sieht Team, Department und Company', async () => {
      const scopes = await getVisiblePinnedScopeIds(prisma, teamLeadId);
      expect(scopes.teamIds).toContain(teamId);
      expect(scopes.departmentIds).toContain(departmentId);
      expect(scopes.companyIds).toContain(companyId);
    });

    it('Gelöschter User sieht keine Scopes', async () => {
      const scopes = await getVisiblePinnedScopeIds(prisma, deletedUserId);
      expect(scopes.teamIds).toEqual([]);
      expect(scopes.departmentIds).toEqual([]);
      expect(scopes.companyIds).toEqual([]);
    });
  });
});
