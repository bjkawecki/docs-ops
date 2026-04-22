/**
 * Helpers for cached display names on Context and Owner (catalog sort/display).
 * Kept in sync when Process/Project/Subcontext or Company/Department/Team/User names change.
 */
import type { PrismaClient } from '../../../../generated/prisma/client.js';

const OWNER_SELECT = {
  company: { select: { name: true } },
  department: { select: { name: true } },
  team: { select: { name: true } },
  ownerUserId: true,
  ownerUser: { select: { name: true } },
} as const;

function ownerDisplayFromRow(o: {
  company?: { name: string } | null;
  department?: { name: string } | null;
  team?: { name: string } | null;
  ownerUserId: string | null;
  ownerUser?: { name: string } | null;
}): string {
  return (
    o.company?.name ??
    o.department?.name ??
    o.team?.name ??
    (o.ownerUserId != null ? (o.ownerUser?.name ?? 'Personal') : 'Personal')
  );
}

/** Resolve display name for an Owner (company/department/team/user name). */
export async function getOwnerDisplayName(prisma: PrismaClient, ownerId: string): Promise<string> {
  const owner = await prisma.owner.findUniqueOrThrow({
    where: { id: ownerId },
    select: OWNER_SELECT,
  });
  return ownerDisplayFromRow(owner);
}

/** Write cached display name to Owner. Call after Owner create or when Company/Department/Team/User name changes. */
export async function setOwnerDisplayName(prisma: PrismaClient, ownerId: string): Promise<void> {
  const name = await getOwnerDisplayName(prisma, ownerId);
  await prisma.owner.update({
    where: { id: ownerId },
    data: { displayName: name },
  });
}

/** Set Context display fields from the linked Process. Call after Process create or when Process.name changes. */
export async function setContextDisplayFromProcess(
  prisma: PrismaClient,
  contextId: string,
  processId: string
): Promise<void> {
  const process = await prisma.process.findUniqueOrThrow({
    where: { id: processId },
    select: { name: true, ownerId: true },
  });
  const ownerDisplay = await getOwnerDisplayName(prisma, process.ownerId);
  await prisma.context.update({
    where: { id: contextId },
    data: {
      displayName: process.name,
      contextType: 'process',
      ownerDisplayName: ownerDisplay,
    },
  });
}

/** Set Context display fields from the linked Project. Call after Project create or when Project.name changes. */
export async function setContextDisplayFromProject(
  prisma: PrismaClient,
  contextId: string,
  projectId: string
): Promise<void> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { name: true, ownerId: true },
  });
  const ownerDisplay = await getOwnerDisplayName(prisma, project.ownerId);
  await prisma.context.update({
    where: { id: contextId },
    data: {
      displayName: project.name,
      contextType: 'project',
      ownerDisplayName: ownerDisplay,
    },
  });
}

/** Set Context display fields from the linked Subcontext. Call after Subcontext create or when Subcontext.name changes. */
export async function setContextDisplayFromSubcontext(
  prisma: PrismaClient,
  contextId: string,
  subcontextId: string
): Promise<void> {
  const sub = await prisma.subcontext.findUniqueOrThrow({
    where: { id: subcontextId },
    select: { name: true, project: { select: { ownerId: true } } },
  });
  const ownerDisplay = await getOwnerDisplayName(prisma, sub.project.ownerId);
  await prisma.context.update({
    where: { id: contextId },
    data: {
      displayName: sub.name,
      contextType: 'project',
      ownerDisplayName: ownerDisplay,
    },
  });
}

/** After Owner.displayName is updated, refresh ownerDisplayName on all Contexts that use this owner (via Process or Project or Subcontext→Project). */
export async function refreshContextOwnerDisplayForOwner(
  prisma: PrismaClient,
  ownerId: string
): Promise<void> {
  const displayName = await getOwnerDisplayName(prisma, ownerId);
  const processContextIds = await prisma.process
    .findMany({ where: { ownerId }, select: { contextId: true } })
    .then((rows) => rows.map((r) => r.contextId));
  const projectContextIds = await prisma.project
    .findMany({ where: { ownerId }, select: { contextId: true } })
    .then((rows) => rows.map((r) => r.contextId));
  const subcontextContextIds = await prisma.subcontext
    .findMany({
      where: { project: { ownerId } },
      select: { contextId: true },
    })
    .then((rows) => rows.map((r) => r.contextId));
  const contextIds = [
    ...new Set([...processContextIds, ...projectContextIds, ...subcontextContextIds]),
  ];
  if (contextIds.length === 0) return;
  await prisma.context.updateMany({
    where: { id: { in: contextIds } },
    data: { ownerDisplayName: displayName },
  });
}
