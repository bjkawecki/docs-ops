import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../db.js';
import { hashPassword } from '../../auth/services/password.js';
import { getReadableCatalogScope } from './catalogPermissions.js';

const TS = `catalog-read-${Date.now()}`;
const PASSWORD = 'testpass';

describe('getReadableCatalogScope', () => {
  let companyId: string;
  let departmentId: string;
  let teamId: string;
  let contextId: string;
  let teamAuthorId: string;
  let outsiderId: string;

  beforeAll(async () => {
    const pw = await hashPassword(PASSWORD);
    const [teamAuthor, outsider] = await Promise.all([
      prisma.user.create({
        data: { name: 'Team Author', email: `team-author-${TS}@test.de`, passwordHash: pw },
      }),
      prisma.user.create({
        data: { name: 'Outsider', email: `outsider-${TS}@test.de`, passwordHash: pw },
      }),
    ]);
    teamAuthorId = teamAuthor.id;
    outsiderId = outsider.id;

    const company = await prisma.company.create({ data: { name: `Co ${TS}` } });
    companyId = company.id;
    const department = await prisma.department.create({
      data: { name: `Dept ${TS}`, companyId },
    });
    departmentId = department.id;
    const team = await prisma.team.create({
      data: { name: `Team ${TS}`, departmentId },
    });
    teamId = team.id;

    await prisma.teamAuthor.create({ data: { teamId, userId: teamAuthorId } });

    const owner = await prisma.owner.create({ data: { teamId } });
    const ctx = await prisma.context.create({});
    await prisma.process.create({
      data: { name: `Proc ${TS}`, contextId: ctx.id, ownerId: owner.id },
    });
    contextId = ctx.id;
  });

  afterAll(async () => {
    await prisma.process.deleteMany({ where: { contextId } });
    await prisma.context.deleteMany({ where: { id: contextId } });
    await prisma.owner.deleteMany({ where: { teamId } });
    await prisma.teamAuthor.deleteMany({ where: { teamId } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.department.deleteMany({ where: { id: departmentId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    const userIds = [teamAuthorId, outsiderId];
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('includes team-owned contexts for team authors', async () => {
    const scope = await getReadableCatalogScope(prisma, teamAuthorId);
    expect(scope.contextIds).toContain(contextId);
  });

  it('does not include team contexts for outsiders', async () => {
    const scope = await getReadableCatalogScope(prisma, outsiderId);
    expect(scope.contextIds).not.toContain(contextId);
  });
});
