import { GrantRole } from '../../../../../generated/prisma/client.js';
import { buildApp } from '../../../../app.js';
import { prisma } from '../../../../db.js';
import { hashPassword } from '../../../auth/services/password.js';
import { blockDocumentJsonFromMarkdown } from '../../services/blocks/documentBlocksBackfill.js';
import { getCookieHeader } from './httpTestHelpers.js';

type TestApp = Awaited<ReturnType<typeof buildApp>>;

type DocumentsTestContext = {
  app: TestApp;
  scopeLeadId: string;
  writerId: string;
  readerOnlyId: string;
  companyId: string;
  departmentId: string;
  teamId: string;
  ownerId: string;
  contextId: string;
  processId: string;
  draftDocId: string;
  publishedDocId: string;
  loginAsScopeLead: () => Promise<string>;
  loginAsWriter: () => Promise<string>;
  loginAsReaderOnly: () => Promise<string>;
};

const PASSWORD = 'testpass';

function token(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function loginAs(app: TestApp, email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: PASSWORD },
  });
  if (response.statusCode !== 204) {
    throw new Error(`Login failed for ${email} (status ${response.statusCode})`);
  }
  return getCookieHeader(response.headers['set-cookie']);
}

async function createDocumentsTestContext(): Promise<DocumentsTestContext> {
  const runId = token('docs');
  const scopeLeadEmail = `scope-lead-${runId}@example.com`;
  const writerEmail = `writer-${runId}@example.com`;
  const readerOnlyEmail = `reader-only-${runId}@example.com`;

  const app = await buildApp();
  const passwordHash = await hashPassword(PASSWORD);

  const [scopeLead, writer, readerOnly] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Scope Lead',
        email: scopeLeadEmail,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Writer',
        email: writerEmail,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        name: 'Reader Only',
        email: readerOnlyEmail,
        passwordHash,
      },
    }),
  ]);

  const company = await prisma.company.create({ data: { name: `Company ${runId}` } });
  const department = await prisma.department.create({
    data: { name: `Dept ${runId}`, companyId: company.id },
  });
  const team = await prisma.team.create({
    data: { name: `Team ${runId}`, departmentId: department.id },
  });
  await prisma.departmentLead.create({
    data: { userId: scopeLead.id, departmentId: department.id },
  });
  const owner = await prisma.owner.create({ data: { departmentId: department.id } });
  const context = await prisma.context.create({ data: {} });
  const process = await prisma.process.create({
    data: { name: `Process ${runId}`, contextId: context.id, ownerId: owner.id },
  });

  const draftDoc = await prisma.document.create({
    data: {
      title: `Draft Doc ${runId}`,
      draftBlocks: blockDocumentJsonFromMarkdown('Initial draft content'),
      contextId: context.id,
    },
  });

  const publishedDoc = await prisma.$transaction(async (tx) => {
    const blocksJson = blockDocumentJsonFromMarkdown('# Intro\n\nPublished content');
    const document = await tx.document.create({
      data: {
        title: `Published Doc ${runId}`,
        draftBlocks: blocksJson,
        contextId: context.id,
      },
    });
    const version = await tx.documentVersion.create({
      data: {
        documentId: document.id,
        blocks: blocksJson,
        blocksSchemaVersion: 0,
        versionNumber: 1,
        createdById: scopeLead.id,
      },
    });
    await tx.document.update({
      where: { id: document.id },
      data: {
        publishedAt: new Date(),
        currentPublishedVersionId: version.id,
      },
    });
    return document;
  });

  await prisma.documentGrantUser.createMany({
    data: [
      { documentId: draftDoc.id, userId: writer.id, role: GrantRole.Read },
      { documentId: draftDoc.id, userId: writer.id, role: GrantRole.Write },
      { documentId: publishedDoc.id, userId: writer.id, role: GrantRole.Read },
      { documentId: publishedDoc.id, userId: writer.id, role: GrantRole.Write },
      { documentId: publishedDoc.id, userId: readerOnly.id, role: GrantRole.Read },
    ],
  });

  return {
    app,
    scopeLeadId: scopeLead.id,
    writerId: writer.id,
    readerOnlyId: readerOnly.id,
    companyId: company.id,
    departmentId: department.id,
    teamId: team.id,
    ownerId: owner.id,
    contextId: context.id,
    processId: process.id,
    draftDocId: draftDoc.id,
    publishedDocId: publishedDoc.id,
    loginAsScopeLead: () => loginAs(app, scopeLeadEmail),
    loginAsWriter: () => loginAs(app, writerEmail),
    loginAsReaderOnly: () => loginAs(app, readerOnlyEmail),
  };
}

async function disposeDocumentsTestContext(
  context: DocumentsTestContext | undefined
): Promise<void> {
  if (!context) return;
  const docIds = [context.draftDocId, context.publishedDocId].filter(
    (id): id is string => id != null
  );
  if (docIds.length > 0) {
    await prisma.documentComment.deleteMany({
      where: { documentId: { in: docIds } },
    });
    await prisma.documentAttachment.deleteMany({
      where: { documentId: { in: docIds } },
    });
    await prisma.documentGrantUser.deleteMany({ where: { documentId: { in: docIds } } });
    await prisma.document.deleteMany({ where: { id: { in: docIds } } });
  }
  await prisma.process.deleteMany({ where: { id: context.processId } });
  await prisma.context.deleteMany({ where: { id: context.contextId } });
  await prisma.owner.deleteMany({ where: { id: context.ownerId } });
  await prisma.departmentLead.deleteMany({ where: { departmentId: context.departmentId } });
  await prisma.team.deleteMany({ where: { id: context.teamId } });
  await prisma.department.deleteMany({ where: { id: context.departmentId } });
  await prisma.company.deleteMany({ where: { id: context.companyId } });

  const userIds = [context.scopeLeadId, context.writerId, context.readerOnlyId].filter(
    (id): id is string => id != null
  );
  if (userIds.length > 0) {
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await context.app.close();
}

export { createDocumentsTestContext, disposeDocumentsTestContext };
export type { DocumentsTestContext };
