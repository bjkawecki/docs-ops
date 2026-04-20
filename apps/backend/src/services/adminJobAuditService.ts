import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';

export type AdminJobAuditAction =
  | 'job-retry'
  | 'job-cancel'
  | 'job-delete'
  | 'job-retry-failed-batch'
  | 'schedule-upsert'
  | 'schedule-remove';

export type AdminJobAuditStatus = 'success' | 'failed';

export async function writeAdminJobAudit(
  prisma: PrismaClient,
  args: {
    actorUserId: string;
    action: AdminJobAuditAction;
    status: AdminJobAuditStatus;
    targetJobId?: string | null;
    targetJobName?: string | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO admin_job_action_audit (
      id,
      actor_user_id,
      action,
      target_job_id,
      target_job_name,
      status,
      details,
      created_at
    )
    VALUES (
      ${randomUUID()},
      ${args.actorUserId},
      ${args.action},
      ${args.targetJobId ?? null},
      ${args.targetJobName ?? null},
      ${args.status},
      ${JSON.stringify(args.details ?? {})}::jsonb,
      NOW()
    )
  `);
}
