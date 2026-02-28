import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GrantRole } from '../../generated/prisma/client.js';
import { buildApp } from '../app.js';
import { prisma } from '../db.js';
import { canRead, canWrite } from './index.js';
import { hashPassword } from '../auth/password.js';

const TS = `perm-${Date.now()}`;

describe('Permissions (canRead, canWrite)', () => {
  let companyId: string;
  let departmentId: string;
  let teamId: string;
  let ownerId: string;
  let contextProcessId: string;
  let processId: string;
  let contextUserSpaceId: string;
  let userSpaceId: string;
  let docProcessId: string;
  let docUserSpaceId: string;
  let adminId: string;
  let deletedUserId: string;
  let supervisorId: string;
  let userSpaceOwnerId: string;
  let teamMemberId: string;
  let teamLeaderId: string;
  let otherUserId: string;

  beforeAll(async () => {
    const pw = await hashPassword('test');
    const [company, admin, deletedUser, supervisor, userSpaceOwner, teamMember, teamLeader, other] =
      await Promise.all([
        prisma.company.create({ data: { name: `Company ${TS}` } }),
        prisma.user.create({
          data: { name: 'Admin', email: `admin-${TS}@test.de`, passwordHash: pw, isAdmin: true },
        }),
        prisma.user.create({
          data: {
            name: 'Deleted',
            email: `deleted-${TS}@test.de`,
            passwordHash: pw,
            deletedAt: new Date(),
          },
        }),
        prisma.user.create({
          data: {
            name: 'Supervisor',
            email: `supervisor-${TS}@test.de`,
            passwordHash: pw,
          },
        }),
        prisma.user.create({
          data: {
            name: 'UserSpace Owner',
            email: `spaceowner-${TS}@test.de`,
            passwordHash: pw,
          },
        }),
        prisma.user.create({
          data: {
            name: 'Team Member',
            email: `member-${TS}@test.de`,
            passwordHash: pw,
          },
        }),
        prisma.user.create({
          data: {
            name: 'Team Leader',
            email: `leader-${TS}@test.de`,
            passwordHash: pw,
          },
        }),
        prisma.user.create({
          data: {
            name: 'Other',
            email: `other-${TS}@test.de`,
            passwordHash: pw,
          },
        }),
      ]);

    companyId = company.id;
    adminId = admin.id;
    deletedUserId = deletedUser.id;
    supervisorId = supervisor.id;
    userSpaceOwnerId = userSpaceOwner.id;
    teamMemberId = teamMember.id;
    teamLeaderId = teamLeader.id;
    otherUserId = other.id;

    const dept = await prisma.department.create({
      data: { name: `Dept ${TS}`, companyId },
    });
    departmentId = dept.id;

    const team = await prisma.team.create({
      data: { name: `Team ${TS}`, departmentId },
    });
    teamId = team.id;

    const owner = await prisma.owner.create({
      data: { departmentId },
    });
    ownerId = owner.id;

    await Promise.all([
      prisma.supervisor.create({
        data: { userId: supervisorId, departmentId },
      }),
      prisma.teamMember.create({ data: { teamId, userId: teamMemberId } }),
      prisma.teamLeader.create({ data: { teamId, userId: teamLeaderId } }),
    ]);

    const ctxProcess = await prisma.context.create({ data: {} });
    contextProcessId = ctxProcess.id;
    const process = await prisma.process.create({
      data: { name: `Process ${TS}`, contextId: contextProcessId, ownerId },
    });
    processId = process.id;

    const ctxUserSpace = await prisma.context.create({ data: {} });
    contextUserSpaceId = ctxUserSpace.id;
    const space = await prisma.userSpace.create({
      data: { name: `Space ${TS}`, contextId: contextUserSpaceId, ownerUserId: userSpaceOwnerId },
    });
    userSpaceId = space.id;

    const docProcess = await prisma.document.create({
      data: {
        title: `Doc Process ${TS}`,
        content: '',
        contextId: contextProcessId,
      },
    });
    docProcessId = docProcess.id;

    const docUserSpace = await prisma.document.create({
      data: {
        title: `Doc UserSpace ${TS}`,
        content: '',
        contextId: contextUserSpaceId,
      },
    });
    docUserSpaceId = docUserSpace.id;

    await Promise.all([
      prisma.documentGrantUser.create({
        data: { documentId: docProcessId, userId: otherUserId, role: GrantRole.Read },
      }),
      prisma.documentGrantTeam.create({
        data: { documentId: docProcessId, teamId, role: GrantRole.Read },
      }),
      prisma.documentGrantTeam.create({
        data: { documentId: docProcessId, teamId, role: GrantRole.Write },
      }),
      prisma.documentGrantDepartment.create({
        data: { documentId: docProcessId, departmentId, role: GrantRole.Read },
      }),
    ]);
  });

  afterAll(async () => {
    const docIds = [docProcessId, docUserSpaceId].filter((id): id is string => id != null);
    if (docIds.length > 0) {
      await prisma.documentGrantUser.deleteMany({
        where: { documentId: { in: docIds } },
      });
      if (docProcessId) {
        await prisma.documentGrantTeam.deleteMany({ where: { documentId: docProcessId } });
        await prisma.documentGrantDepartment.deleteMany({ where: { documentId: docProcessId } });
      }
      await prisma.document.deleteMany({
        where: { id: { in: docIds } },
      });
    }
    if (userSpaceId) await prisma.userSpace.deleteMany({ where: { id: userSpaceId } });
    if (processId) await prisma.process.deleteMany({ where: { id: processId } });
    const ctxIds = [contextProcessId, contextUserSpaceId].filter((id): id is string => id != null);
    if (ctxIds.length > 0) await prisma.context.deleteMany({ where: { id: { in: ctxIds } } });
    if (teamId) {
      await prisma.teamLeader.deleteMany({ where: { teamId } });
      await prisma.teamMember.deleteMany({ where: { teamId } });
    }
    if (departmentId) await prisma.supervisor.deleteMany({ where: { departmentId } });
    if (ownerId) await prisma.owner.deleteMany({ where: { id: ownerId } });
    if (teamId) await prisma.team.deleteMany({ where: { id: teamId } });
    if (departmentId) await prisma.department.deleteMany({ where: { id: departmentId } });
    if (companyId) await prisma.company.deleteMany({ where: { id: companyId } });
    const userIds = [
      adminId,
      deletedUserId,
      supervisorId,
      userSpaceOwnerId,
      teamMemberId,
      teamLeaderId,
      otherUserId,
    ].filter((id): id is string => id != null);
    if (userIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  it('isAdmin → canRead/canWrite true', async () => {
    expect(await canRead(prisma, adminId, docProcessId)).toBe(true);
    expect(await canWrite(prisma, adminId, docProcessId)).toBe(true);
  });

  it('deleted User → canRead/canWrite false', async () => {
    expect(await canRead(prisma, deletedUserId, docProcessId)).toBe(false);
    expect(await canWrite(prisma, deletedUserId, docProcessId)).toBe(false);
  });

  it('Supervisor der Abteilung → canRead true (Dokument im Process)', async () => {
    expect(await canRead(prisma, supervisorId, docProcessId)).toBe(true);
  });

  it('UserSpace-Owner → canRead/canWrite true', async () => {
    expect(await canRead(prisma, userSpaceOwnerId, docUserSpaceId)).toBe(true);
    expect(await canWrite(prisma, userSpaceOwnerId, docUserSpaceId)).toBe(true);
  });

  it('Expliziter Grant User Read → canRead true', async () => {
    expect(await canRead(prisma, otherUserId, docProcessId)).toBe(true);
  });

  it('Expliziter Grant Team Read (Mitglied) → canRead true', async () => {
    expect(await canRead(prisma, teamMemberId, docProcessId)).toBe(true);
  });

  it('Expliziter Grant Team Write nur für TeamLeader → canWrite true (Leader), false (Member)', async () => {
    expect(await canWrite(prisma, teamLeaderId, docProcessId)).toBe(true);
    expect(await canWrite(prisma, teamMemberId, docProcessId)).toBe(false);
  });

  it('Expliziter Grant Department Read → canRead true für User in Abteilung', async () => {
    expect(await canRead(prisma, teamMemberId, docProcessId)).toBe(true);
    expect(await canRead(prisma, teamLeaderId, docProcessId)).toBe(true);
  });

  it('Document nicht vorhanden (ID) → false', async () => {
    expect(await canRead(prisma, adminId, 'non-existent-doc-id')).toBe(false);
    expect(await canWrite(prisma, adminId, 'non-existent-doc-id')).toBe(false);
  });
});

describe('requireDocumentAccess (GET /api/v1/documents/:documentId)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userId: string;
  let documentId: string;
  let contextId: string;
  const email = `doc-route-${Date.now()}@test.de`;
  const password = 'test';

  beforeAll(async () => {
    app = await buildApp();
    const pw = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        name: 'Doc Route User',
        email,
        passwordHash: pw,
      },
    });
    userId = user.id;
    const ctx = await prisma.context.create({ data: {} });
    contextId = ctx.id;
    await prisma.userSpace.create({
      data: {
        name: 'Test Space',
        contextId: ctx.id,
        ownerUserId: userId,
      },
    });
    const doc = await prisma.document.create({
      data: { title: 'Test Doc', content: '', contextId: ctx.id },
    });
    documentId = doc.id;
  });

  afterAll(async () => {
    if (documentId) await prisma.document.deleteMany({ where: { id: documentId } });
    if (userId) {
      await prisma.userSpace.deleteMany({ where: { ownerUserId: userId } });
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (contextId) await prisma.context.deleteMany({ where: { id: contextId } });
    await app?.close();
  });

  it('ohne Cookie → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('ungültige documentId → 404', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(loginRes.statusCode).toBe(204);
    const cookie = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie'].join('; ')
      : String(loginRes.headers['set-cookie'] ?? '');

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/documents/non-existent-id-12345',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('mit Cookie, gültige documentId aber ohne Zugriff → 403', async () => {
    const noAccessEmail = `noaccess-${Date.now()}@test.de`;
    const pw = await hashPassword('test');
    const noAccessUser = await prisma.user.create({
      data: { name: 'No Access', email: noAccessEmail, passwordHash: pw },
    });
    try {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: noAccessEmail, password: 'test' },
      });
      expect(loginRes.statusCode).toBe(204);
      const cookie = Array.isArray(loginRes.headers['set-cookie'])
        ? loginRes.headers['set-cookie'].join('; ')
        : String(loginRes.headers['set-cookie'] ?? '');

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/documents/${documentId}`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await prisma.session.deleteMany({ where: { userId: noAccessUser.id } });
      await prisma.user.deleteMany({ where: { id: noAccessUser.id } });
    }
  });

  it('mit Cookie und Zugriff → 200', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(loginRes.statusCode).toBe(204);
    const cookie = Array.isArray(loginRes.headers['set-cookie'])
      ? loginRes.headers['set-cookie'].join('; ')
      : String(loginRes.headers['set-cookie'] ?? '');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; title: string };
    expect(body.id).toBe(documentId);
    expect(body.title).toBe('Test Doc');
  });
});
