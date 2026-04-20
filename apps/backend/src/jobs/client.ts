import { PgBoss } from 'pg-boss';
import type { JobWithMetadata } from 'pg-boss';
import { jobDefinitions } from './jobRegistry.js';
import type { JobPayloadByType, JobType } from './jobTypes.js';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/docsops';

let boss: PgBoss | null = null;
let bossStartPromise: Promise<PgBoss> | null = null;

async function getBoss(): Promise<PgBoss> {
  if (boss != null) return boss;
  if (bossStartPromise != null) return bossStartPromise;

  bossStartPromise = (async () => {
    const instance = new PgBoss(connectionString);
    await instance.start();
    boss = instance;
    return instance;
  })();
  return bossStartPromise;
}

async function ensureQueue(jobType: JobType): Promise<void> {
  const definition = jobDefinitions.find((entry) => entry.name === jobType);
  if (!definition) throw new Error(`Unknown job type: ${jobType}`);
  const pgBoss = await getBoss();
  await pgBoss.createQueue(definition.name, { retryLimit: definition.retryLimit });
}

export async function enqueueJob<K extends JobType>(
  jobType: K,
  payload: JobPayloadByType[K]
): Promise<string> {
  await ensureQueue(jobType);
  const pgBoss = await getBoss();
  const jobId = await pgBoss.send(jobType, payload as object);
  if (!jobId) throw new Error(`Failed to enqueue job: ${jobType}`);
  return jobId;
}

export async function getJobById<K extends JobType>(
  jobType: K,
  jobId: string
): Promise<JobWithMetadata<unknown> | null> {
  const pgBoss = await getBoss();
  const jobs = await pgBoss.findJobs(jobType, { id: jobId });
  return jobs[0] ?? null;
}

export async function cancelJob<K extends JobType>(jobType: K, jobId: string): Promise<void> {
  const pgBoss = await getBoss();
  await pgBoss.cancel(jobType, jobId);
}

export async function retryJob<K extends JobType>(jobType: K, jobId: string): Promise<void> {
  const pgBoss = await getBoss();
  await pgBoss.retry(jobType, jobId);
}

export async function getSchedules(jobType?: JobType): Promise<unknown[]> {
  const pgBoss = await getBoss();
  if (jobType) return (await pgBoss.getSchedules(jobType)) as unknown[];
  return (await pgBoss.getSchedules()) as unknown[];
}

export async function upsertSchedule<K extends JobType>(args: {
  jobType: K;
  cron: string;
  payload?: object;
  tz?: string;
  key?: string;
}): Promise<void> {
  const pgBoss = await getBoss();
  const options: { tz?: string; key?: string } = {};
  if (args.tz) options.tz = args.tz;
  if (args.key) options.key = args.key;
  await pgBoss.schedule(args.jobType, args.cron, args.payload ?? {}, options);
}

export async function removeSchedule<K extends JobType>(jobType: K, key?: string): Promise<void> {
  const pgBoss = await getBoss();
  if (key) {
    await pgBoss.unschedule(jobType, key);
    return;
  }
  await pgBoss.unschedule(jobType);
}
