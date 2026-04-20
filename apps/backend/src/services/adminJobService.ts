import type { PrismaClient } from '../../generated/prisma/client.js';
import { jobTypes, type JobType } from '../jobs/jobTypes.js';
import { retryJob } from '../jobs/client.js';

type FailedJobRow = {
  id: string;
  name: string;
};

export type RetryFailedJobsArgs = {
  jobName?: string;
  limit: number;
};

export type RetryFailedJobsResult = {
  attempted: number;
  retried: number;
  skippedUnsupported: number;
  failed: number;
  retriedJobIds: string[];
};

export async function retryFailedJobs(
  prisma: PrismaClient,
  args: RetryFailedJobsArgs
): Promise<RetryFailedJobsResult> {
  const whereSql = args.jobName
    ? "WHERE state::text = 'failed' AND name = $1"
    : "WHERE state::text = 'failed'";
  const params = args.jobName ? [args.jobName, args.limit] : [args.limit];

  const rows = await prisma.$queryRawUnsafe<FailedJobRow[]>(
    `
      SELECT id, name
      FROM pgboss.job
      ${whereSql}
      ORDER BY completed_on DESC NULLS LAST
      LIMIT $${args.jobName ? 2 : 1}
    `,
    ...params
  );

  let retried = 0;
  let skippedUnsupported = 0;
  let failed = 0;
  const retriedJobIds: string[] = [];

  for (const row of rows) {
    if (!jobTypes.includes(row.name as JobType)) {
      skippedUnsupported += 1;
      continue;
    }
    try {
      await retryJob(row.name as JobType, row.id);
      retried += 1;
      retriedJobIds.push(row.id);
    } catch {
      failed += 1;
    }
  }

  return {
    attempted: rows.length,
    retried,
    skippedUnsupported,
    failed,
    retriedJobIds,
  };
}
