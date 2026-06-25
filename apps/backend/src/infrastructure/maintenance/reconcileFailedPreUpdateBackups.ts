import type { PrismaClient } from '../../../generated/prisma/client.js';
import { failUpdateRun } from '../../domains/admin/services/adminSystemUpdateApplyService.js';

/** Fail update runs whose pre-update backup already failed (runtime recovery without API restart). */
export async function reconcileFailedPreUpdateBackups(prisma: PrismaClient): Promise<void> {
  const staleRuns = await prisma.updateRun.findMany({
    where: { status: 'backing_up' },
    include: { backupRun: { select: { status: true, errorMessage: true } } },
  });

  for (const run of staleRuns) {
    if (run.backupRun?.status === 'failed') {
      await failUpdateRun(
        prisma,
        run.id,
        run.backupRun.errorMessage ?? 'Pre-update backup failed',
        { notify: false }
      );
    }
  }
}
