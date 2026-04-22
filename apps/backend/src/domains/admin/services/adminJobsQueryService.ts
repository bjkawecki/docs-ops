import { Prisma } from '../../../../generated/prisma/client.js';
import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { jobTypes } from '../../../infrastructure/jobs/jobTypes.js';

export const DEFAULT_ALERT_QUEUED_LAG_SECONDS = 300;
export const DEFAULT_ALERT_FAILED_RECENT_COUNT = 5;
export const DEFAULT_ALERT_FAILED_RECENT_WINDOW_MINUTES = 15;
export const ASYNC_JOBS_RUNBOOK_PATH = '/docs/plan/Runbook-Async-Jobs-Betrieb.md';

type ListAdminJobsQuery = {
  limit: number;
  offset: number;
  jobName?: string;
  state?: string;
  requestedByUserId?: string;
  search?: string;
};

type ListAdminJobAuditQuery = {
  limit: number;
  offset: number;
  action?: string;
  status?: string;
};

type AdminJobRow = {
  id: string;
  name: string;
  state: string;
  priority: number;
  data: unknown;
  output: unknown;
  retry_limit: number;
  retry_count: number;
  retry_delay: number;
  retry_backoff: boolean;
  start_after: Date;
  created_on: Date;
  started_on: Date | null;
  completed_on: Date | null;
  heartbeat_on: Date | null;
  keep_until: Date;
  singleton_key: string | null;
  dead_letter: string | null;
  policy: string | null;
};

type AdminQueueHealthRow = {
  name: string;
  retry_limit: number;
  retry_delay: number;
  retry_backoff: boolean;
  dead_letter: string | null;
  queued_count: number;
  active_count: number;
  total_count: number;
  monitor_on: Date | null;
  created_on: Date;
  updated_on: Date;
};

type WorkerHeartbeatRow = {
  last_heartbeat: Date | null;
};

type AdminJobAlertMetricsRow = {
  queued_count: number;
  running_count: number;
  failed_total_count: number;
  failed_recent_count: number;
  oldest_queued_on: Date | null;
};

type AdminJobAuditRow = {
  id: string;
  actor_user_id: string;
  action: string;
  target_job_id: string | null;
  target_job_name: string | null;
  status: string;
  details: unknown;
  created_at: Date;
};

export type AdminJobActionRow = {
  id: string;
  name: string;
  state: string;
};

function mapAdminJobRow(row: AdminJobRow) {
  return {
    id: row.id,
    jobName: row.name,
    state: row.state,
    priority: row.priority,
    payload: row.data,
    output: row.output,
    retryLimit: row.retry_limit,
    retryCount: row.retry_count,
    retryDelay: row.retry_delay,
    retryBackoff: row.retry_backoff,
    startAfter: row.start_after,
    createdOn: row.created_on,
    startedOn: row.started_on,
    completedOn: row.completed_on,
    heartbeatOn: row.heartbeat_on,
    keepUntil: row.keep_until,
    singletonKey: row.singleton_key,
    deadLetter: row.dead_letter,
    policy: row.policy,
  };
}

function buildJobsWhereSql(query: ListAdminJobsQuery): Prisma.Sql {
  const whereParts: Prisma.Sql[] = [];
  if (query.jobName) whereParts.push(Prisma.sql`name = ${query.jobName}`);
  if (query.state) whereParts.push(Prisma.sql`state = ${query.state}::pgboss.job_state`);
  if (query.requestedByUserId) {
    whereParts.push(Prisma.sql`data ->> 'requestedByUserId' = ${query.requestedByUserId}`);
  }
  if (query.search?.trim()) {
    const term = `%${query.search.trim()}%`;
    whereParts.push(
      Prisma.sql`(name ILIKE ${term} OR id::text ILIKE ${term} OR data::text ILIKE ${term})`
    );
  }
  return whereParts.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(whereParts, ' AND ')}`
    : Prisma.empty;
}

export async function listAdminJobs(prisma: PrismaClient, query: ListAdminJobsQuery) {
  const whereSql = buildJobsWhereSql(query);
  const [countRows, rows] = await Promise.all([
    prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM pgboss.job
      ${whereSql}
    `),
    prisma.$queryRaw<AdminJobRow[]>(Prisma.sql`
      SELECT
        id,
        name,
        state::text AS state,
        priority,
        data,
        output,
        retry_limit,
        retry_count,
        retry_delay,
        retry_backoff,
        start_after,
        created_on,
        started_on,
        completed_on,
        heartbeat_on,
        keep_until,
        singleton_key,
        dead_letter,
        policy
      FROM pgboss.job
      ${whereSql}
      ORDER BY created_on DESC
      LIMIT ${query.limit}
      OFFSET ${query.offset}
    `),
  ]);

  return {
    items: rows.map(mapAdminJobRow),
    total: Number(countRows[0]?.total ?? 0n),
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getAdminJobById(prisma: PrismaClient, jobId: string) {
  const rows = await prisma.$queryRaw<AdminJobRow[]>(Prisma.sql`
    SELECT
      id,
      name,
      state::text AS state,
      priority,
      data,
      output,
      retry_limit,
      retry_count,
      retry_delay,
      retry_backoff,
      start_after,
      created_on,
      started_on,
      completed_on,
      heartbeat_on,
      keep_until,
      singleton_key,
      dead_letter,
      policy
    FROM pgboss.job
    WHERE id = ${jobId}
    ORDER BY created_on DESC
    LIMIT 1
  `);
  const job = rows[0];
  return job ? mapAdminJobRow(job) : null;
}

export async function getAdminJobActionRow(prisma: PrismaClient, jobId: string) {
  const rows = await prisma.$queryRaw<AdminJobActionRow[]>(Prisma.sql`
    SELECT id, name, state::text AS state
    FROM pgboss.job
    WHERE id = ${jobId}
    ORDER BY created_on DESC
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function deleteAdminJobById(prisma: PrismaClient, jobId: string) {
  const deletedRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    DELETE FROM pgboss.job
    WHERE id = ${jobId}
    RETURNING id
  `);
  return deletedRows.length > 0;
}

export async function listAdminJobAudit(prisma: PrismaClient, query: ListAdminJobAuditQuery) {
  const whereParts: Prisma.Sql[] = [];
  if (query.action) whereParts.push(Prisma.sql`action = ${query.action}`);
  if (query.status) whereParts.push(Prisma.sql`status = ${query.status}`);
  const whereSql =
    whereParts.length > 0 ? Prisma.sql`WHERE ${Prisma.join(whereParts, ' AND ')}` : Prisma.empty;

  const [countRows, rows] = await Promise.all([
    prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM admin_job_action_audit
      ${whereSql}
    `),
    prisma.$queryRaw<AdminJobAuditRow[]>(Prisma.sql`
      SELECT
        id,
        actor_user_id,
        action,
        target_job_id,
        target_job_name,
        status,
        details,
        created_at
      FROM admin_job_action_audit
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT ${query.limit}
      OFFSET ${query.offset}
    `),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      action: row.action,
      targetJobId: row.target_job_id,
      targetJobName: row.target_job_name,
      status: row.status,
      details: row.details,
      createdAt: row.created_at,
    })),
    total: Number(countRows[0]?.total ?? 0n),
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getAdminJobsHealth(prisma: PrismaClient) {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return {
      status: 'error' as const,
      workerConnected: false,
      queueReachable: false,
      message: 'Database/queue unreachable',
    };
  }

  const queueRows = await prisma.$queryRaw<AdminQueueHealthRow[]>(Prisma.sql`
    SELECT
      name,
      retry_limit,
      retry_delay,
      retry_backoff,
      dead_letter,
      queued_count,
      active_count,
      total_count,
      monitor_on,
      created_on,
      updated_on
    FROM pgboss.queue
    WHERE name IN (${Prisma.join(jobTypes)})
    ORDER BY name ASC
  `);

  let lastHeartbeat: Date | null = null;
  try {
    const heartbeatRows = await prisma.$queryRaw<WorkerHeartbeatRow[]>(Prisma.sql`
      SELECT MAX(heartbeat_at) AS last_heartbeat
      FROM worker_heartbeat
    `);
    lastHeartbeat = heartbeatRows[0]?.last_heartbeat ?? null;
  } catch {
    lastHeartbeat = null;
  }
  const workerConnected =
    lastHeartbeat != null && Date.now() - new Date(lastHeartbeat).getTime() < 60 * 1000;

  return {
    status: workerConnected ? ('ok' as const) : ('degraded' as const),
    queueReachable: true,
    workerConnected,
    lastWorkerHeartbeat: lastHeartbeat,
    queues: queueRows.map((row) => ({
      jobName: row.name,
      retryLimit: row.retry_limit,
      retryDelay: row.retry_delay,
      retryBackoff: row.retry_backoff,
      deadLetter: row.dead_letter,
      queuedCount: row.queued_count,
      activeCount: row.active_count,
      totalCount: row.total_count,
      monitorOn: row.monitor_on,
      createdOn: row.created_on,
      updatedOn: row.updated_on,
    })),
  };
}

export async function getAdminJobsAlerts(
  prisma: PrismaClient,
  args: {
    queuedLagThresholdSeconds: number;
    failedRecentThresholdCount: number;
    failedRecentWindowMinutes: number;
  }
) {
  const [metrics] = await prisma.$queryRaw<AdminJobAlertMetricsRow[]>(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE state::text IN ('created', 'retry'))::int AS queued_count,
      COUNT(*) FILTER (WHERE state::text = 'active')::int AS running_count,
      COUNT(*) FILTER (WHERE state::text = 'failed')::int AS failed_total_count,
      COUNT(*) FILTER (
        WHERE state::text = 'failed'
          AND completed_on >= NOW() - (${args.failedRecentWindowMinutes} * INTERVAL '1 minute')
      )::int AS failed_recent_count,
      MIN(created_on) FILTER (WHERE state::text IN ('created', 'retry')) AS oldest_queued_on
    FROM pgboss.job
    WHERE name IN (${Prisma.join(jobTypes)})
  `);

  const oldestQueuedOn = metrics?.oldest_queued_on ?? null;
  const oldestQueuedLagSeconds =
    oldestQueuedOn != null
      ? Math.max(0, Math.floor((Date.now() - oldestQueuedOn.getTime()) / 1000))
      : null;
  const queuedCount = metrics?.queued_count ?? 0;
  const runningCount = metrics?.running_count ?? 0;
  const failedTotalCount = metrics?.failed_total_count ?? 0;
  const failedRecentCount = metrics?.failed_recent_count ?? 0;

  const alerts: Array<{ code: string; severity: 'warning' | 'critical'; message: string }> = [];
  if (oldestQueuedLagSeconds != null && oldestQueuedLagSeconds >= args.queuedLagThresholdSeconds) {
    alerts.push({
      code: 'queue-lag',
      severity:
        oldestQueuedLagSeconds >= args.queuedLagThresholdSeconds * 2 ? 'critical' : 'warning',
      message: `Oldest queued job age ${oldestQueuedLagSeconds}s exceeds threshold ${args.queuedLagThresholdSeconds}s`,
    });
  }
  if (failedRecentCount >= args.failedRecentThresholdCount) {
    alerts.push({
      code: 'failed-jobs-spike',
      severity: failedRecentCount >= args.failedRecentThresholdCount * 2 ? 'critical' : 'warning',
      message: `${failedRecentCount} failed jobs in last ${args.failedRecentWindowMinutes} minutes`,
    });
  }

  return {
    status: alerts.length > 0 ? 'degraded' : 'ok',
    runbook: ASYNC_JOBS_RUNBOOK_PATH,
    thresholds: {
      queuedLagSeconds: args.queuedLagThresholdSeconds,
      failedRecentCount: args.failedRecentThresholdCount,
      failedRecentWindowMinutes: args.failedRecentWindowMinutes,
    },
    metrics: {
      queuedCount,
      runningCount,
      failedTotalCount,
      failedRecentCount,
      oldestQueuedOn,
      oldestQueuedLagSeconds,
    },
    alerts,
  };
}
