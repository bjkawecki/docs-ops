import type { FastifyReply } from 'fastify';
import type { PrismaClient } from '../../../../../generated/prisma/client.js';
import { canReadContext, canWriteContext } from '../../permissions/contextPermissions.js';

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
