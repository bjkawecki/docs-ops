import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../../../generated/prisma/client.js';
import type { PrismaClient } from '../../../../generated/prisma/client.js';

export type AdminBackupAuditAction =
  | 'backup-create'
  | 'backup-local-delete'
  | 'destination-create'
  | 'destination-update'
  | 'destination-delete'
  | 'settings-update'
  | 'schedule-update';

export async function writeAdminBackupAudit(
  prisma: PrismaClient,
  args: {
    actorUserId: string;
    action: AdminBackupAuditAction;
    status: 'success' | 'failed';
    backupRunId?: string | null;
    destinationId?: string | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await prisma.adminBackupActionAudit.create({
    data: {
      id: randomUUID(),
      actorUserId: args.actorUserId,
      action: args.action,
      status: args.status,
      backupRunId: args.backupRunId ?? null,
      destinationId: args.destinationId ?? null,
      details: (args.details ?? {}) as Prisma.InputJsonValue,
    },
  });
}
