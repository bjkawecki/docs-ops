import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../../db.js';
import { hashPassword } from '../../auth/services/password.js';
import { listUserIdsWhoCanReadLeadDraft } from '../../notifications/services/notificationRecipients.js';
import { canReadLeadDraft } from '../permissions/canEditLeadDraft.js';
import { emptyBlockDocumentJson } from '../services/blocks/documentBlocksBackfill.js';

const TS = `draft-sse-${Date.now()}`;
const PASSWORD = 'testpass';

describe('draft collaboration SSE recipients', () => {
  let companyId: string;
  let departmentId: string;
  let teamId: string;
  let ownerId: string;
  let contextId: string;
  let processId: string;
  let teamLeadId: string;
  let teamAuthorId: string;
  let outsiderId: string;
  let docTeamId: string;

  beforeAll(async () => {
    const pw = await hashPassword(PASSWORD);
    const [teamLead, teamAuthor, outsider] = await Promise.all([
      prisma.user.create({
        data: { name: 'Team Lead', email: `team-lead-${TS}@test.de`, passwordHash: pw },
      }),
      prisma.user.create({
        data: { name: 'Team Author', email: `team-author-${TS}@test.de`, passwordHash: pw },
      }),
      prisma.user.create({
        data: { name: 'Outsider', email: `outsider-${TS}@test.de`, passwordHash: pw },
      }),
    ]);
    teamLeadId = teamLead.id;
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

    await Promise.all([
      prisma.teamLead.create({ data: { teamId, userId: teamLeadId } }),
      prisma.teamAuthor.create({ data: { teamId, userId: teamAuthorId } }),
    ]);

    const owner = await prisma.owner.create({ data: { teamId } });
    ownerId = owner.id;
    const ctx = await prisma.context.create({});
    contextId = ctx.id;
    const process = await prisma.process.create({
      data: { name: `Proc ${TS}`, contextId, ownerId: owner.id },
    });
    processId = process.id;

    const doc = await prisma.document.create({
      data: {
        title: `Draft SSE ${TS}`,
        draftBlocks: emptyBlockDocumentJson(),
        contextId: ctx.id,
      },
    });
    docTeamId = doc.id;
  });

  afterAll(async () => {
    await prisma.document.deleteMany({ where: { id: docTeamId } });
    await prisma.process.deleteMany({ where: { id: processId } });
    await prisma.context.deleteMany({ where: { id: contextId } });
    await prisma.owner.deleteMany({ where: { id: ownerId } });
    await prisma.teamAuthor.deleteMany({ where: { teamId } });
    await prisma.teamLead.deleteMany({ where: { teamId } });
    await prisma.team.deleteMany({ where: { id: teamId } });
    await prisma.department.deleteMany({ where: { id: departmentId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    const userIds = [teamLeadId, teamAuthorId, outsiderId];
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('team author and team lead are in listUserIdsWhoCanReadLeadDraft for team-owned doc', async () => {
    const ids = await listUserIdsWhoCanReadLeadDraft(prisma, docTeamId);
    expect(ids).toContain(teamLeadId);
    expect(ids).toContain(teamAuthorId);
    expect(ids).not.toContain(outsiderId);
    expect(await canReadLeadDraft(prisma, teamAuthorId, docTeamId)).toBe(true);
    expect(await canReadLeadDraft(prisma, teamLeadId, docTeamId)).toBe(true);
  });

  it('includes actor (lead) in recipients for multi-tab collaboration sync', async () => {
    const ids = await listUserIdsWhoCanReadLeadDraft(prisma, docTeamId);
    expect(ids).toContain(teamLeadId);
  });
});
