import './load-env.js';
import { prisma } from '../src/db.js';
import { enqueueJob } from '../src/jobs/client.js';

const COUNT = Math.max(1, Number(process.env.JOB_LOADTEST_COUNT ?? 200));
const CONCURRENCY = Math.max(1, Number(process.env.JOB_LOADTEST_CONCURRENCY ?? 20));
const TIMEOUT_MS = Math.max(5_000, Number(process.env.JOB_LOADTEST_TIMEOUT_MS ?? 120_000));
const TASK = (process.env.JOB_LOADTEST_TASK ?? 'temporary-assets') as
  | 'temporary-assets'
  | 'failed-jobs'
  | 'orphaned-exports'
  | 'user-notifications-retention';

async function withPool<T>(
  items: number[],
  concurrency: number,
  worker: (item: number) => Promise<T>
) {
  const running = new Set<Promise<unknown>>();
  for (const item of items) {
    const p = worker(item).finally(() => {
      running.delete(p);
    });
    running.add(p);
    if (running.size >= concurrency) {
      await Promise.race(running);
    }
  }
  await Promise.all(running);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();
  console.log(
    `[jobs-loadtest] start count=${COUNT} concurrency=${CONCURRENCY} task=${TASK} startedAt=${startedAtIso}`
  );

  const indexes = Array.from({ length: COUNT }, (_, index) => index);
  await withPool(indexes, CONCURRENCY, async () => {
    await enqueueJob('maintenance.cleanup', { task: TASK });
  });

  console.log('[jobs-loadtest] enqueue complete, polling queue state...');
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<
      Array<{
        state: string;
        count: bigint;
      }>
    >`
      SELECT state::text AS state, COUNT(*)::bigint AS count
      FROM pgboss.job
      WHERE name = 'maintenance.cleanup'
        AND created_on >= ${startedAt}
      GROUP BY state
    `;
    const counts = new Map(rows.map((row) => [row.state, Number(row.count)]));
    const completed = counts.get('completed') ?? 0;
    const failed = counts.get('failed') ?? 0;
    const active = counts.get('active') ?? 0;
    const queued = (counts.get('created') ?? 0) + (counts.get('retry') ?? 0);
    const totalSeen = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
    console.log(
      `[jobs-loadtest] seen=${totalSeen}/${COUNT} queued=${queued} active=${active} completed=${completed} failed=${failed}`
    );
    if (completed + failed >= COUNT) {
      console.log('[jobs-loadtest] done');
      if (failed > 0) {
        throw new Error(`[jobs-loadtest] ${failed} jobs failed`);
      }
      return;
    }
    await sleep(1000);
  }

  throw new Error(`[jobs-loadtest] timeout after ${TIMEOUT_MS}ms`);
}

void main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
