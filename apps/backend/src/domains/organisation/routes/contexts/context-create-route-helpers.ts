import type { FastifyReply } from 'fastify';
import type { PrismaClient } from '../../../../../generated/prisma/client.js';
import { canCreateProcessOrProjectForOwner } from '../../permissions/contextPermissions.js';

/** Owner-Optionen fuer `canCreateProcessOrProjectForOwner` / `findOrCreateOwner` (Process/Project-Create-Body). */
export function ownerOptsFromProcessProjectCreateBody(
  body: {
    companyId?: string | undefined;
    departmentId?: string | undefined;
    teamId?: string | undefined;
    personal?: true;
  },
  userId: string
): {
  companyId?: string;
  departmentId?: string;
  teamId?: string;
  ownerUserId?: string;
} {
  return {
    companyId: body.companyId ?? undefined,
    departmentId: body.departmentId ?? undefined,
    teamId: body.teamId ?? undefined,
    ownerUserId: body.personal === true ? userId : undefined,
  };
}

export async function assertCanCreateProcessOrProjectOr403(
  prisma: PrismaClient,
  userId: string,
  ownerOpts: ReturnType<typeof ownerOptsFromProcessProjectCreateBody>,
  reply: FastifyReply,
  deniedMessage: string
): Promise<boolean> {
  const allowed = await canCreateProcessOrProjectForOwner(prisma, userId, ownerOpts);
  if (!allowed) {
    void reply.status(403).send({ error: deniedMessage });
    return false;
  }
  return true;
}
