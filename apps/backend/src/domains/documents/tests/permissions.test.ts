import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GrantRole } from '../../../../generated/prisma/client.js';
import { buildApp } from '../../../app.js';
import { prisma } from '../../../db.js';
import {
  canRead,
  canWrite,
  canDeleteDocument,
  canPublishDocument,
  canEditLeadDraft,
  canReadLeadDraft,
  canCreateSuggestion,
  canReadSuggestions,
  canResolveSuggestion,
} from '../permissions/index.js';
import { hashPassword } from '../../auth/services/password.js';
import {
  listUserIdsWhoCanReadDocument,
  symmetricDiffUserIds,
} from '../../notifications/services/notificationRecipients.js';
import { emptyBlockDocumentJson } from '../services/blocks/documentBlocksBackfill.js';

const TS = `perm-${Date.now()}`;

describe('Permissions (canRead, canWrite)', () => {
  let companyId: string;
  let departmentId: string;
  let teamId: string;
  let ownerId: string;
  let contextProcessId: string;
  let processId: string;
  let personalOwnerId: string;
  let contextPersonalId: string;
  let personalProcessId: string;
  let docProcessId: string;
  let docPersonalId: string;
  let adminId: string;
  let deletedUserId: string;
  let supervisorId: string;
  let personalOwnerUserId: string;
  let teamMemberId: string;
  let teamLeaderId: string;
  let otherUserId: string;
  let writerOnlyUserId: string;

  beforeAll(async () => {
    const pw = await hashPassword('test');
    const [
      company,
      admin,
      deletedUser,
      supervisor,
      userSpaceOwner,
      teamMember,
      teamLeader,
      other,
      writerOnly,
    ] = await Promise.all([
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
          name: 'Personal Owner',
          email: `personalowner-${TS}@test.de`,
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
      prisma.user.create({
        data: {
          name: 'Writer Only',
          email: `writeronly-${TS}@test.de`,
          passwordHash: pw,
        },
      }),
    ]);

    companyId = company.id;
    adminId = admin.id;
    deletedUserId = deletedUser.id;
    supervisorId = supervisor.id;
    personalOwnerUserId = userSpaceOwner.id;
    teamMemberId = teamMember.id;
    teamLeaderId = teamLeader.id;
    otherUserId = other.id;
    writerOnlyUserId = writerOnly.id;

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
      prisma.departmentLead.create({
        data: { userId: supervisorId, departmentId },
      }),
      prisma.teamMember.create({ data: { teamId, userId: teamMemberId } }),
      prisma.teamMember.create({ data: { teamId, userId: teamLeaderId } }),
      prisma.teamLead.create({ data: { teamId, userId: teamLeaderId } }),
    ]);

    const ctxProcess = await prisma.context.create({ data: {} });
    contextProcessId = ctxProcess.id;
    const process = await prisma.process.create({
      data: { name: `Process ${TS}`, contextId: contextProcessId, ownerId },
    });
    processId = process.id;

    const personalOwner = await prisma.owner.create({
      data: { ownerUserId: personalOwnerUserId },
    });
    personalOwnerId = personalOwner.id;
    const ctxPersonal = await prisma.context.create({ data: {} });
    contextPersonalId = ctxPersonal.id;
    const personalProcess = await prisma.process.create({
      data: {
        name: `Personal Process ${TS}`,
        contextId: contextPersonalId,
        ownerId: personalOwnerId,
      },
    });
    personalProcessId = personalProcess.id;

    const docProcess = await prisma.document.create({
      data: {
        title: `Doc Process ${TS}`,
        draftBlocks: emptyBlockDocumentJson(),
        contextId: contextProcessId,
      },
    });
    docProcessId = docProcess.id;

    const docPersonal = await prisma.document.create({
      data: {
        title: `Doc Personal ${TS}`,
        draftBlocks: emptyBlockDocumentJson(),
        contextId: contextPersonalId,
      },
    });
    docPersonalId = docPersonal.id;

    await Promise.all([
      prisma.documentGrantUser.create({
        data: { documentId: docProcessId, userId: otherUserId, role: GrantRole.Read },
      }),
      prisma.documentGrantUser.create({
        data: { documentId: docProcessId, userId: writerOnlyUserId, role: GrantRole.Write },
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
    const docIds = [docProcessId, docPersonalId].filter((id): id is string => id != null);
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
    if (personalProcessId) await prisma.process.deleteMany({ where: { id: personalProcessId } });
    if (processId) await prisma.process.deleteMany({ where: { id: processId } });
    const ctxIds = [contextProcessId, contextPersonalId].filter((id): id is string => id != null);
    if (ctxIds.length > 0) await prisma.context.deleteMany({ where: { id: { in: ctxIds } } });
    if (personalOwnerId) await prisma.owner.deleteMany({ where: { id: personalOwnerId } });
    if (teamId) {
      await prisma.teamLead.deleteMany({ where: { teamId } });
      await prisma.teamMember.deleteMany({ where: { teamId } });
    }
    if (departmentId) await prisma.departmentLead.deleteMany({ where: { departmentId } });
    if (ownerId) await prisma.owner.deleteMany({ where: { id: ownerId } });
    if (teamId) await prisma.team.deleteMany({ where: { id: teamId } });
    if (departmentId) await prisma.department.deleteMany({ where: { id: departmentId } });
    if (companyId) await prisma.company.deleteMany({ where: { id: companyId } });
    const userIds = [
      adminId,
      deletedUserId,
      supervisorId,
      personalOwnerUserId,
      teamMemberId,
      teamLeaderId,
      otherUserId,
      writerOnlyUserId,
    ].filter((id): id is string => id != null);
    if (userIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  it('isAdmin → canRead/canWrite true', async () => {
    // Update + Prüfung in einer Transaktion, damit parallele Suites (z. B. admin.test updateMany) den Admin nicht überschreiben
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: adminId }, data: { isAdmin: true } });
      expect(await canRead(tx, adminId, docProcessId)).toBe(true);
    });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: adminId }, data: { isAdmin: true } });
      expect(await canWrite(tx, adminId, docProcessId)).toBe(true);
    });
  });

  it('deleted User → canRead/canWrite false', async () => {
    expect(await canRead(prisma, deletedUserId, docProcessId)).toBe(false);
    expect(await canWrite(prisma, deletedUserId, docProcessId)).toBe(false);
  });

  it('Department Lead der Abteilung → canRead true (Dokument im Process)', async () => {
    expect(await canRead(prisma, supervisorId, docProcessId)).toBe(true);
  });

  it('Personal process owner (ownerUserId) → canRead/canWrite true', async () => {
    expect(await canRead(prisma, personalOwnerUserId, docPersonalId)).toBe(true);
    expect(await canWrite(prisma, personalOwnerUserId, docPersonalId)).toBe(true);
  });

  it('Expliziter Grant User Read → canRead true', async () => {
    expect(await canRead(prisma, otherUserId, docProcessId)).toBe(true);
  });

  it('Expliziter Grant Team Read (Mitglied) → canRead true', async () => {
    expect(await canRead(prisma, teamMemberId, docProcessId)).toBe(true);
  });

  it('Expliziter Grant Team Write nur für Team Lead → canWrite true (Leader), false (Member)', async () => {
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

  describe('canDeleteDocument', () => {
    beforeAll(async () => {
      // Other test files (e.g. admin.test) may set isAdmin false globally; ensure our admin is admin.
      await prisma.user.update({ where: { id: adminId }, data: { isAdmin: true } });
    });
    it('isAdmin → canDeleteDocument true', async () => {
      expect(await canDeleteDocument(prisma, adminId, docProcessId)).toBe(true);
    });

    it('Scope-Lead (Department Lead) → canDeleteDocument true', async () => {
      expect(await canDeleteDocument(prisma, supervisorId, docProcessId)).toBe(true);
    });

    it('Personal process owner (ownerUserId) → canDeleteDocument true for document in personal context', async () => {
      expect(await canDeleteDocument(prisma, personalOwnerUserId, docPersonalId)).toBe(true);
    });

    it('nur Writer-Grant (kein Lead) → canWrite true, canDeleteDocument false', async () => {
      expect(await canWrite(prisma, writerOnlyUserId, docProcessId)).toBe(true);
      expect(await canDeleteDocument(prisma, writerOnlyUserId, docProcessId)).toBe(false);
    });

    it('Team Lead ohne Kontext-Ownership (Process-Owner = Department) → canDeleteDocument false', async () => {
      expect(await canDeleteDocument(prisma, teamLeaderId, docProcessId)).toBe(false);
    });

    it('Dokument nicht vorhanden → canDeleteDocument false', async () => {
      expect(await canDeleteDocument(prisma, adminId, 'non-existent-doc-id')).toBe(false);
    });
  });

  describe('canPublishDocument', () => {
    beforeAll(async () => {
      await prisma.user.update({ where: { id: adminId }, data: { isAdmin: true } });
    });
    it('isAdmin → canPublishDocument true', async () => {
      expect(await canPublishDocument(prisma, adminId, docProcessId)).toBe(true);
    });
    it('Scope-Lead (Department Lead) → canPublishDocument true', async () => {
      expect(await canPublishDocument(prisma, supervisorId, docProcessId)).toBe(true);
    });
    it('Personal process owner → canPublishDocument true for document in personal context', async () => {
      expect(await canPublishDocument(prisma, personalOwnerUserId, docPersonalId)).toBe(true);
    });
    it('nur Writer-Grant (kein Lead) → canPublishDocument false', async () => {
      expect(await canPublishDocument(prisma, writerOnlyUserId, docProcessId)).toBe(false);
    });
    it('Dokument nicht vorhanden → canPublishDocument false', async () => {
      expect(await canPublishDocument(prisma, adminId, 'non-existent-doc-id')).toBe(false);
    });
  });

  describe('Lead-Draft (canEditLeadDraft, canReadLeadDraft)', () => {
    beforeAll(async () => {
      await prisma.user.update({ where: { id: adminId }, data: { isAdmin: true } });
    });

    it('canEditLeadDraft entspricht canPublishDocument', async () => {
      expect(await canEditLeadDraft(prisma, supervisorId, docProcessId)).toBe(
        await canPublishDocument(prisma, supervisorId, docProcessId)
      );
      expect(await canEditLeadDraft(prisma, writerOnlyUserId, docProcessId)).toBe(
        await canPublishDocument(prisma, writerOnlyUserId, docProcessId)
      );
    });

    it('nur User-Read-Grant (ohne Write/Lead) → canReadLeadDraft false', async () => {
      expect(await canRead(prisma, otherUserId, docProcessId)).toBe(true);
      expect(await canWrite(prisma, otherUserId, docProcessId)).toBe(false);
      expect(await canReadLeadDraft(prisma, otherUserId, docProcessId)).toBe(false);
    });

    it('Writer-Grant → canReadLeadDraft true', async () => {
      expect(await canReadLeadDraft(prisma, writerOnlyUserId, docProcessId)).toBe(true);
    });

    it('Team-Lead (Team-Write-Grant gilt nur für Lead) → canReadLeadDraft true', async () => {
      expect(await canReadLeadDraft(prisma, teamLeaderId, docProcessId)).toBe(true);
    });

    it('Team-Mitglied ohne Write-Grant → canReadLeadDraft false', async () => {
      expect(await canReadLeadDraft(prisma, teamMemberId, docProcessId)).toBe(false);
    });
  });

  describe('Document-Suggestions (EPIC-5)', () => {
    it('canCreateSuggestion entspricht canWrite', async () => {
      expect(await canCreateSuggestion(prisma, writerOnlyUserId, docProcessId)).toBe(
        await canWrite(prisma, writerOnlyUserId, docProcessId)
      );
      expect(await canCreateSuggestion(prisma, otherUserId, docProcessId)).toBe(false);
    });
    it('canReadSuggestions entspricht canReadLeadDraft', async () => {
      expect(await canReadSuggestions(prisma, writerOnlyUserId, docProcessId)).toBe(
        await canReadLeadDraft(prisma, writerOnlyUserId, docProcessId)
      );
      expect(await canReadSuggestions(prisma, otherUserId, docProcessId)).toBe(
        await canReadLeadDraft(prisma, otherUserId, docProcessId)
      );
    });
    it('canResolveSuggestion entspricht canEditLeadDraft', async () => {
      expect(await canResolveSuggestion(prisma, supervisorId, docProcessId)).toBe(
        await canEditLeadDraft(prisma, supervisorId, docProcessId)
      );
      expect(await canResolveSuggestion(prisma, writerOnlyUserId, docProcessId)).toBe(false);
    });
  });

  describe('notificationRecipients', () => {
    beforeAll(async () => {
      await prisma.user.update({ where: { id: adminId }, data: { isAdmin: true } });
    });

    it('listUserIdsWhoCanReadDocument: recipients pass canRead; writer-only grant excluded', async () => {
      await prisma.user.update({ where: { id: adminId }, data: { isAdmin: true } });

      let lastError: unknown;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const ids = await listUserIdsWhoCanReadDocument(prisma, docProcessId);
          expect(ids.length).toBeGreaterThan(0);
          for (const uid of ids) {
            // admin.routes.test u. a. nutzen globale isAdmin-Updates; bei parallelen Suites kann
            // jeder in der Liste betroffene Admin kurzzeitig demotet sein — Re-List nach Retry.
            if (uid === adminId) {
              await prisma.user.update({ where: { id: adminId }, data: { isAdmin: true } });
            }
            expect(await canRead(prisma, uid, docProcessId)).toBe(true);
          }
          expect(await canRead(prisma, writerOnlyUserId, docProcessId)).toBe(false);
          expect(ids).not.toContain(writerOnlyUserId);
          if (await canRead(prisma, adminId, docProcessId)) {
            expect(ids).toContain(adminId);
          }
          expect(ids).toContain(supervisorId);
          return;
        } catch (e) {
          lastError = e;
          await new Promise((r) => setTimeout(r, 30));
          await prisma.user.update({ where: { id: adminId }, data: { isAdmin: true } });
        }
      }
      throw lastError;
    });

    it('symmetricDiffUserIds', () => {
      expect(symmetricDiffUserIds(new Set(['a', 'b']), new Set(['b', 'c'])).sort()).toEqual([
        'a',
        'c',
      ]);
    });
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
    const owner = await prisma.owner.create({ data: { ownerUserId: userId } });
    const ctx = await prisma.context.create({ data: {} });
    contextId = ctx.id;
    await prisma.process.create({
      data: { name: 'Test Personal Process', contextId: ctx.id, ownerId: owner.id },
    });
    const doc = await prisma.document.create({
      data: { title: 'Test Doc', draftBlocks: emptyBlockDocumentJson(), contextId: ctx.id },
    });
    documentId = doc.id;
  });

  afterAll(async () => {
    if (documentId) await prisma.document.deleteMany({ where: { id: documentId } });
    if (userId) {
      const proc = await prisma.process.findFirst({
        where: { owner: { ownerUserId: userId } },
        select: { id: true },
      });
      if (proc) await prisma.process.deleteMany({ where: { id: proc.id } });
      await prisma.owner.deleteMany({ where: { ownerUserId: userId } });
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
