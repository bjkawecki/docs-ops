import type { FastifyReply } from 'fastify';
import type { Prisma, PrismaClient } from '../../../../../generated/prisma/client.js';
import { canReadContext, canWriteContext } from '../../permissions/contextPermissions.js';
import {
  getProjectContextIds,
  restoreProcessWithDocuments,
  restoreProjectWithDocuments,
  unarchiveProcessWithDocuments,
  unarchiveProjectWithDocuments,
} from '../../services/contexts/context-lifecycle.service.js';

export async function assertReadContextOr403(
  prisma: PrismaClient,
  userId: string,
  contextId: string,
  reply: FastifyReply
): Promise<boolean> {
  const allowed = await canReadContext(prisma, userId, contextId);
  if (!allowed) {
    void reply.status(403).send({ error: 'No access' });
    return false;
  }
  return true;
}

export async function assertWriteContextOr403(
  prisma: PrismaClient,
  userId: string,
  contextId: string,
  reply: FastifyReply
): Promise<boolean> {
  const allowed = await canWriteContext(prisma, userId, contextId);
  if (!allowed) {
    void reply.status(403).send({ error: 'No write permission' });
    return false;
  }
  return true;
}

/** Lädt Project per id, prüft Schreibrecht auf Kontext; bei 403 wurde geantwortet. */
export async function findProjectOrThrowWithWriteGate<S extends Prisma.ProjectSelect>(
  prisma: PrismaClient,
  userId: string,
  projectId: string,
  reply: FastifyReply,
  select: S
): Promise<Prisma.ProjectGetPayload<{ select: S }> | null> {
  const row = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select,
  });
  const contextId = (row as { contextId: string }).contextId;
  if (!(await assertWriteContextOr403(prisma, userId, contextId, reply))) return null;
  return row;
}

/** Lädt Process per id, prüft Schreibrecht auf Kontext; bei 403 wurde geantwortet. */
export async function findProcessOrThrowWithWriteGate<S extends Prisma.ProcessSelect>(
  prisma: PrismaClient,
  userId: string,
  processId: string,
  reply: FastifyReply,
  select: S
): Promise<Prisma.ProcessGetPayload<{ select: S }> | null> {
  const row = await prisma.process.findUniqueOrThrow({
    where: { id: processId },
    select,
  });
  const contextId = (row as { contextId: string }).contextId;
  if (!(await assertWriteContextOr403(prisma, userId, contextId, reply))) return null;
  return row;
}

export type ContextEntityLifecycleKind = 'restoreFromTrash' | 'unarchive';

/** Restore/Unarchive: zuerst Zustands-400 wie zuvor, dann Write-Gate. */
export async function loadProjectForLifecycleMutation(
  prisma: PrismaClient,
  userId: string,
  projectId: string,
  reply: FastifyReply,
  kind: ContextEntityLifecycleKind
): Promise<{ contextId: string } | null> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { contextId: true, deletedAt: true, archivedAt: true },
  });
  if (kind === 'restoreFromTrash') {
    if (project.deletedAt == null) {
      void reply.status(400).send({ error: 'Project is not in trash' });
      return null;
    }
  } else if (project.archivedAt == null) {
    void reply.status(400).send({ error: 'Project is not archived' });
    return null;
  }
  if (!(await assertWriteContextOr403(prisma, userId, project.contextId, reply))) return null;
  return { contextId: project.contextId };
}

/** Restore/Unarchive Process: gleiche Reihenfolge wie bei Project. */
export async function loadProcessForLifecycleMutation(
  prisma: PrismaClient,
  userId: string,
  processId: string,
  reply: FastifyReply,
  kind: ContextEntityLifecycleKind
): Promise<{ contextId: string } | null> {
  const process = await prisma.process.findUniqueOrThrow({
    where: { id: processId },
    select: { contextId: true, deletedAt: true, archivedAt: true },
  });
  if (kind === 'restoreFromTrash') {
    if (process.deletedAt == null) {
      void reply.status(400).send({ error: 'Process is not in trash' });
      return null;
    }
  } else if (process.archivedAt == null) {
    void reply.status(400).send({ error: 'Process is not archived' });
    return null;
  }
  if (!(await assertWriteContextOr403(prisma, userId, process.contextId, reply))) return null;
  return { contextId: process.contextId };
}

/** Parallel wie bisher: bei fehlendem Leserecht 403 `No access`, sonst canWriteContext fuer Response. */
export async function gateReadContextWithWriteHint(
  prisma: PrismaClient,
  userId: string,
  contextId: string,
  reply: FastifyReply
): Promise<boolean | null> {
  const [readAllowed, writeAllowed] = await Promise.all([
    canReadContext(prisma, userId, contextId),
    canWriteContext(prisma, userId, contextId),
  ]);
  if (!readAllowed) {
    void reply.status(403).send({ error: 'No access' });
    return null;
  }
  return writeAllowed;
}

export async function getProjectParentContextId(
  prisma: PrismaClient,
  projectId: string
): Promise<string> {
  const row = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { contextId: true },
  });
  return row.contextId;
}

/** Subcontext inkl. Parent-Project-contextId (Schreib-Gate auf Projekt-Kontext). */
export async function loadSubcontextWithProjectContextForWriteGate(
  prisma: PrismaClient,
  subcontextId: string
) {
  return prisma.subcontext.findUniqueOrThrow({
    where: { id: subcontextId },
    include: { project: { select: { contextId: true } } },
  });
}

/** Subcontext für PATCH/DELETE: Parent-Projekt-Kontext + Schreib-Gate; bei 403 `null`. */
export async function loadSubcontextWithProjectWriteGateOrNull(
  prisma: PrismaClient,
  userId: string,
  subcontextId: string,
  reply: FastifyReply
): Promise<Awaited<ReturnType<typeof loadSubcontextWithProjectContextForWriteGate>> | null> {
  const subcontext = await loadSubcontextWithProjectContextForWriteGate(prisma, subcontextId);
  if (!(await assertWriteContextOr403(prisma, userId, subcontext.project.contextId, reply))) {
    return null;
  }
  return subcontext;
}

export type SubcontextRowWithProjectContext = Awaited<
  ReturnType<typeof loadSubcontextWithProjectContextForWriteGate>
>;

/** PATCH/DELETE Subcontext: gleicher Gate-Block, Fortsetzung im Callback. */
export async function withSubcontextProjectWriteGate(
  prisma: PrismaClient,
  userId: string,
  subcontextId: string,
  reply: FastifyReply,
  fn: (subcontext: SubcontextRowWithProjectContext) => Promise<void>
): Promise<void> {
  const subcontext = await loadSubcontextWithProjectWriteGateOrNull(
    prisma,
    userId,
    subcontextId,
    reply
  );
  if (!subcontext) return;
  await fn(subcontext);
}

/** PATCH/DELETE Project: Write-Gate + alle Kontext-IDs des Projekts (Dokumente). */
export async function findProjectWriteGatedWithContextIds(
  prisma: PrismaClient,
  userId: string,
  projectId: string,
  reply: FastifyReply
): Promise<{ contextId: string; contextIds: string[] } | null> {
  const project = await findProjectOrThrowWithWriteGate(prisma, userId, projectId, reply, {
    contextId: true,
  });
  if (!project) return null;
  const contextIds = await getProjectContextIds(prisma, projectId);
  return { contextId: project.contextId, contextIds };
}

/** PATCH/DELETE Project: Write-Gate + Kontext-IDs, Fortsetzung im Callback. */
export async function withProjectWriteGatedContextIds(
  prisma: PrismaClient,
  userId: string,
  projectId: string,
  reply: FastifyReply,
  fn: (ctx: { contextId: string; contextIds: string[] }) => Promise<void>
): Promise<void> {
  const gated = await findProjectWriteGatedWithContextIds(prisma, userId, projectId, reply);
  if (!gated) return;
  await fn(gated);
}

/** `true`, wenn Restore ausgeführt wurde; bei 400/403 bereits geantwortet → `false`. */
export async function completeProjectRestoreFromTrash(
  prisma: PrismaClient,
  userId: string,
  projectId: string,
  reply: FastifyReply
): Promise<boolean> {
  const gated = await loadProjectForLifecycleMutation(
    prisma,
    userId,
    projectId,
    reply,
    'restoreFromTrash'
  );
  if (!gated) return false;
  const contextIds = await getProjectContextIds(prisma, projectId);
  await restoreProjectWithDocuments(prisma, projectId, contextIds);
  return true;
}

/** `true`, wenn Unarchive ausgeführt wurde; bei 400/403 bereits geantwortet → `false`. */
export async function completeProjectUnarchive(
  prisma: PrismaClient,
  userId: string,
  projectId: string,
  reply: FastifyReply
): Promise<boolean> {
  const gated = await loadProjectForLifecycleMutation(
    prisma,
    userId,
    projectId,
    reply,
    'unarchive'
  );
  if (!gated) return false;
  const contextIds = await getProjectContextIds(prisma, projectId);
  await unarchiveProjectWithDocuments(prisma, projectId, contextIds);
  return true;
}

type ProcessWriteGatedRow = Prisma.ProcessGetPayload<{ select: { contextId: true } }>;

/** PATCH/DELETE Process: Write-Gate, Fortsetzung mit `contextId`. */
export async function withProcessWriteGatedByContextId(
  prisma: PrismaClient,
  userId: string,
  processId: string,
  reply: FastifyReply,
  fn: (row: ProcessWriteGatedRow) => Promise<void>
): Promise<void> {
  const process = await findProcessOrThrowWithWriteGate(prisma, userId, processId, reply, {
    contextId: true,
  });
  if (!process) return;
  await fn(process);
}

export async function completeProcessRestoreFromTrash(
  prisma: PrismaClient,
  userId: string,
  processId: string,
  reply: FastifyReply
): Promise<boolean> {
  const gated = await loadProcessForLifecycleMutation(
    prisma,
    userId,
    processId,
    reply,
    'restoreFromTrash'
  );
  if (!gated) return false;
  await restoreProcessWithDocuments(prisma, processId, gated.contextId);
  return true;
}

export async function completeProcessUnarchive(
  prisma: PrismaClient,
  userId: string,
  processId: string,
  reply: FastifyReply
): Promise<boolean> {
  const gated = await loadProcessForLifecycleMutation(
    prisma,
    userId,
    processId,
    reply,
    'unarchive'
  );
  if (!gated) return false;
  await unarchiveProcessWithDocuments(prisma, processId, gated.contextId);
  return true;
}
