import type { PrismaClient } from '../../../../../generated/prisma/client.js';

async function setArchivedAtForContextDocuments(
  prisma: PrismaClient,
  contextIds: string[],
  archivedAt: Date | null
): Promise<void> {
  await prisma.document.updateMany({
    where: { contextId: { in: contextIds } },
    data: { archivedAt },
  });
}

async function deletePinnedForContextDocuments(
  prisma: PrismaClient,
  contextIds: string[]
): Promise<void> {
  const docIds = await prisma.document.findMany({
    where: { contextId: { in: contextIds } },
    select: { id: true },
  });
  const ids = docIds.map((doc) => doc.id);
  if (ids.length > 0) {
    await prisma.documentPinnedInScope.deleteMany({ where: { documentId: { in: ids } } });
  }
}

async function softDeleteProcessWithDocuments(
  prisma: PrismaClient,
  processId: string,
  contextId: string
): Promise<void> {
  await deletePinnedForContextDocuments(prisma, [contextId]);
  await prisma.$transaction([
    prisma.document.updateMany({
      where: { contextId },
      data: { deletedAt: new Date() },
    }),
    prisma.process.update({
      where: { id: processId },
      data: { deletedAt: new Date() },
    }),
  ]);
}

async function restoreProcessWithDocuments(
  prisma: PrismaClient,
  processId: string,
  contextId: string
): Promise<void> {
  await prisma.$transaction([
    prisma.document.updateMany({
      where: { contextId },
      data: { deletedAt: null },
    }),
    prisma.process.update({
      where: { id: processId },
      data: { deletedAt: null },
    }),
  ]);
}

async function unarchiveProcessWithDocuments(
  prisma: PrismaClient,
  processId: string,
  contextId: string
): Promise<void> {
  await prisma.$transaction([
    prisma.document.updateMany({
      where: { contextId },
      data: { archivedAt: null },
    }),
    prisma.process.update({
      where: { id: processId },
      data: { archivedAt: null },
    }),
  ]);
}

async function getProjectContextIds(prisma: PrismaClient, projectId: string): Promise<string[]> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { contextId: true, subcontexts: { select: { contextId: true } } },
  });
  return [project.contextId, ...project.subcontexts.map((subcontext) => subcontext.contextId)];
}

async function softDeleteProjectWithDocuments(
  prisma: PrismaClient,
  projectId: string,
  contextIds: string[]
): Promise<void> {
  await deletePinnedForContextDocuments(prisma, contextIds);
  await prisma.$transaction([
    prisma.document.updateMany({
      where: { contextId: { in: contextIds } },
      data: { deletedAt: new Date() },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    }),
  ]);
}

async function restoreProjectWithDocuments(
  prisma: PrismaClient,
  projectId: string,
  contextIds: string[]
): Promise<void> {
  await prisma.$transaction([
    prisma.document.updateMany({
      where: { contextId: { in: contextIds } },
      data: { deletedAt: null },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: null },
    }),
  ]);
}

async function unarchiveProjectWithDocuments(
  prisma: PrismaClient,
  projectId: string,
  contextIds: string[]
): Promise<void> {
  await prisma.$transaction([
    prisma.document.updateMany({
      where: { contextId: { in: contextIds } },
      data: { archivedAt: null },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { archivedAt: null },
    }),
  ]);
}

export {
  setArchivedAtForContextDocuments,
  softDeleteProcessWithDocuments,
  restoreProcessWithDocuments,
  unarchiveProcessWithDocuments,
  getProjectContextIds,
  softDeleteProjectWithDocuments,
  restoreProjectWithDocuments,
  unarchiveProjectWithDocuments,
};
