import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import {
  requireAuthPreHandler,
  requireAdminPreHandler,
  type RequestWithUser,
} from '../../auth/middleware.js';
import {
  adminJobIdParamSchema,
  adminJobNameParamSchema,
  listAdminJobAuditQuerySchema,
  listAdminJobsQuerySchema,
  patchAdminScheduleBodySchema,
  retryFailedJobsBodySchema,
} from '../schemas/admin/jobs.js';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  cancelJob,
  getSchedules,
  removeSchedule,
  retryJob,
  upsertSchedule,
} from '../../jobs/client.js';
import { jobTypes, type JobType } from '../../jobs/jobTypes.js';
import { retryFailedJobs } from '../../services/admin/adminJobService.js';
import { writeAdminJobAudit } from '../../services/admin/adminJobAuditService.js';

const schedulableJobTypes = [
  'search.reindex.full',
  'maintenance.cleanup',
] as const satisfies readonly JobType[];
const DEFAULT_ALERT_QUEUED_LAG_SECONDS = 300;
const DEFAULT_ALERT_FAILED_RECENT_COUNT = 5;
const DEFAULT_ALERT_FAILED_RECENT_WINDOW_MINUTES = 15;
const ASYNC_JOBS_RUNBOOK_PATH = '/docs/plan/Runbook-Async-Jobs-Betrieb.md';
const QUEUE_RETRY_AFTER_SECONDS = 15;

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

const adminJobsRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  const preAdmin = [requireAuthPreHandler, requireAdminPreHandler];

  const writeAuditSafe = async (
    request: RequestWithUser,
    args: {
      action:
        | 'job-retry'
        | 'job-cancel'
        | 'job-delete'
        | 'job-retry-failed-batch'
        | 'schedule-upsert'
        | 'schedule-remove';
      status: 'success' | 'failed';
      targetJobId?: string | null;
      targetJobName?: string | null;
      details?: Record<string, unknown>;
    }
  ): Promise<void> => {
    try {
      await writeAdminJobAudit(request.server.prisma, {
        actorUserId: request.user.id,
        action: args.action,
        status: args.status,
        targetJobId: args.targetJobId ?? null,
        targetJobName: args.targetJobName ?? null,
        details: args.details,
      });
    } catch (error) {
      request.log.warn({ error, action: args.action }, 'Failed to write admin job audit entry');
    }
  };

  const sendQueueUnavailable = (reply: FastifyReply, message: string) =>
    reply.header('Retry-After', String(QUEUE_RETRY_AFTER_SECONDS)).status(503).send({
      error: message,
      code: 'QUEUE_UNAVAILABLE',
    });

  /** GET /api/v1/admin/jobs – Jobliste mit Filtern/Paging für Monitoring. */
  app.get('/admin/jobs', { preHandler: preAdmin }, async (request, reply) => {
    const prisma = request.server.prisma;
    const query = listAdminJobsQuerySchema.parse(request.query);
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

    const whereSql =
      whereParts.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(whereParts, Prisma.sql` AND `)}`
        : Prisma.empty;

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

    return reply.send({
      items: rows.map((row) => ({
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
      })),
      total: Number(countRows[0]?.total ?? 0n),
      limit: query.limit,
      offset: query.offset,
    });
  });

  /** GET /api/v1/admin/jobs/:jobId – Job-Details (queue-übergreifend per UUID). */
  app.get<{ Params: { jobId: string } }>(
    '/admin/jobs/:jobId',
    { preHandler: preAdmin },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { jobId } = adminJobIdParamSchema.parse(request.params);
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
      if (!job) return reply.status(404).send({ error: 'Job not found' });
      return reply.send({
        id: job.id,
        jobName: job.name,
        state: job.state,
        priority: job.priority,
        payload: job.data,
        output: job.output,
        retryLimit: job.retry_limit,
        retryCount: job.retry_count,
        retryDelay: job.retry_delay,
        retryBackoff: job.retry_backoff,
        startAfter: job.start_after,
        createdOn: job.created_on,
        startedOn: job.started_on,
        completedOn: job.completed_on,
        heartbeatOn: job.heartbeat_on,
        keepUntil: job.keep_until,
        singletonKey: job.singleton_key,
        deadLetter: job.dead_letter,
        policy: job.policy,
      });
    }
  );

  /** POST /api/v1/admin/jobs/:jobId/retry – fehlgeschlagenen Job erneut einreihen. */
  app.post<{ Params: { jobId: string } }>(
    '/admin/jobs/:jobId/retry',
    { preHandler: preAdmin },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { jobId } = adminJobIdParamSchema.parse(request.params);
      const rows = await prisma.$queryRaw<
        Array<{ id: string; name: string; state: string }>
      >(Prisma.sql`
        SELECT id, name, state::text AS state
        FROM pgboss.job
        WHERE id = ${jobId}
        ORDER BY created_on DESC
        LIMIT 1
      `);
      const job = rows[0];
      if (!job) return reply.status(404).send({ error: 'Job not found' });
      if (!jobTypes.includes(job.name as JobType)) {
        return reply.status(400).send({ error: 'Unsupported job type for retry' });
      }
      try {
        await retryJob(job.name as JobType, job.id);
      } catch (error) {
        request.log.warn({ error, jobId }, 'Retry failed due to unavailable queue infrastructure');
        await writeAuditSafe(request as RequestWithUser, {
          action: 'job-retry',
          status: 'failed',
          targetJobId: job.id,
          targetJobName: job.name,
          details: { reason: 'queue-unavailable' },
        });
        return sendQueueUnavailable(reply, 'Queue unavailable. Retry later.');
      }
      await writeAuditSafe(request as RequestWithUser, {
        action: 'job-retry',
        status: 'success',
        targetJobId: job.id,
        targetJobName: job.name,
      });
      return reply.status(204).send();
    }
  );

  /** POST /api/v1/admin/jobs/:jobId/cancel – Job abbrechen (queued/running). */
  app.post<{ Params: { jobId: string } }>(
    '/admin/jobs/:jobId/cancel',
    { preHandler: preAdmin },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { jobId } = adminJobIdParamSchema.parse(request.params);
      const rows = await prisma.$queryRaw<
        Array<{ id: string; name: string; state: string }>
      >(Prisma.sql`
        SELECT id, name, state::text AS state
        FROM pgboss.job
        WHERE id = ${jobId}
        ORDER BY created_on DESC
        LIMIT 1
      `);
      const job = rows[0];
      if (!job) return reply.status(404).send({ error: 'Job not found' });
      if (!jobTypes.includes(job.name as JobType)) {
        return reply.status(400).send({ error: 'Unsupported job type for cancel' });
      }
      try {
        await cancelJob(job.name as JobType, job.id);
      } catch (error) {
        request.log.warn({ error, jobId }, 'Cancel failed due to unavailable queue infrastructure');
        await writeAuditSafe(request as RequestWithUser, {
          action: 'job-cancel',
          status: 'failed',
          targetJobId: job.id,
          targetJobName: job.name,
          details: { reason: 'queue-unavailable' },
        });
        return sendQueueUnavailable(reply, 'Queue unavailable. Cancel later.');
      }
      await writeAuditSafe(request as RequestWithUser, {
        action: 'job-cancel',
        status: 'success',
        targetJobId: job.id,
        targetJobName: job.name,
      });
      return reply.status(204).send();
    }
  );

  /** POST /api/v1/admin/jobs/retry-failed – fehlgeschlagene Jobs gebuendelt erneut einreihen. */
  app.post('/admin/jobs/retry-failed', { preHandler: preAdmin }, async (request, reply) => {
    const prisma = request.server.prisma;
    const body = retryFailedJobsBodySchema.parse(request.body ?? {});
    try {
      const result = await retryFailedJobs(prisma, {
        jobName: body.jobName?.trim() || undefined,
        limit: body.limit,
      });
      await writeAuditSafe(request as RequestWithUser, {
        action: 'job-retry-failed-batch',
        status: 'success',
        targetJobName: body.jobName?.trim() || null,
        details: result as unknown as Record<string, unknown>,
      });
      return reply.send(result);
    } catch (error) {
      request.log.warn(
        { error, jobName: body.jobName, limit: body.limit },
        'Bulk retry failed due to unavailable queue infrastructure'
      );
      await writeAuditSafe(request as RequestWithUser, {
        action: 'job-retry-failed-batch',
        status: 'failed',
        targetJobName: body.jobName?.trim() || null,
        details: { reason: 'queue-unavailable', limit: body.limit },
      });
      return sendQueueUnavailable(reply, 'Queue unavailable. Bulk retry later.');
    }
  });

  /** DELETE /api/v1/admin/jobs/:jobId – Job aus der Queue-Historie entfernen. */
  app.delete<{ Params: { jobId: string } }>(
    '/admin/jobs/:jobId',
    { preHandler: preAdmin },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const { jobId } = adminJobIdParamSchema.parse(request.params);
      const deletedRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        DELETE FROM pgboss.job
        WHERE id = ${jobId}
        RETURNING id
      `);
      if (deletedRows.length === 0) return reply.status(404).send({ error: 'Job not found' });
      await writeAuditSafe(request as RequestWithUser, {
        action: 'job-delete',
        status: 'success',
        targetJobId: jobId,
      });
      return reply.status(204).send();
    }
  );

  /** GET /api/v1/admin/jobs/audit – Audit-Log zu Admin-Job/Scheduler-Aktionen. */
  app.get('/admin/jobs/audit', { preHandler: preAdmin }, async (request, reply) => {
    const prisma = request.server.prisma;
    const query = listAdminJobAuditQuerySchema.parse(request.query);
    const whereParts: Prisma.Sql[] = [];
    if (query.action) whereParts.push(Prisma.sql`action = ${query.action}`);
    if (query.status) whereParts.push(Prisma.sql`status = ${query.status}`);
    const whereSql =
      whereParts.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(whereParts, Prisma.sql` AND `)}`
        : Prisma.empty;

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

    return reply.send({
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
    });
  });

  /** GET /api/v1/admin/jobs/schedules – geplante Jobs inkl. verfügbarer Jobtypen. */
  app.get('/admin/jobs/schedules', { preHandler: preAdmin }, async (request, reply) => {
    let schedules: unknown[];
    try {
      schedules = await getSchedules();
    } catch (error) {
      request.log.warn(
        { error },
        'Failed to load schedules due to unavailable queue infrastructure'
      );
      return sendQueueUnavailable(reply, 'Queue unavailable. Schedules not reachable.');
    }
    const allowed = new Set<JobType>(schedulableJobTypes);
    return reply.send({
      availableJobNames: schedulableJobTypes,
      items: (schedules as Array<Record<string, unknown>>)
        .filter((entry) => allowed.has(String(entry.name) as JobType))
        .map((entry) => ({
          jobName: entry.name,
          key: entry.key ?? '',
          cron: entry.cron,
          tz: entry.timezone ?? entry.tz ?? null,
          payload: entry.data ?? {},
          options: entry.options ?? {},
          createdOn: entry.createdOn ?? null,
          updatedOn: entry.updatedOn ?? null,
        })),
    });
  });

  /** PATCH /api/v1/admin/jobs/schedules/:jobName – Scheduler aktivieren/deaktivieren/ändern. */
  app.patch<{ Params: { jobName: string } }>(
    '/admin/jobs/schedules/:jobName',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { jobName } = adminJobNameParamSchema.parse(request.params);
      const body = patchAdminScheduleBodySchema.parse(request.body);
      if (!schedulableJobTypes.includes(jobName as (typeof schedulableJobTypes)[number])) {
        return reply.status(400).send({ error: 'Job type is not schedulable' });
      }

      const key = body.key?.trim() || undefined;
      if (!body.enabled) {
        try {
          await removeSchedule(jobName as JobType, key);
        } catch (error) {
          request.log.warn(
            { error, jobName, key },
            'Failed to remove schedule due to unavailable queue infrastructure'
          );
          await writeAuditSafe(request as RequestWithUser, {
            action: 'schedule-remove',
            status: 'failed',
            targetJobName: jobName,
            details: { reason: 'queue-unavailable', key: key ?? null },
          });
          return sendQueueUnavailable(reply, 'Queue unavailable. Schedule update later.');
        }
        await writeAuditSafe(request as RequestWithUser, {
          action: 'schedule-remove',
          status: 'success',
          targetJobName: jobName,
          details: { key: key ?? null },
        });
        return reply.status(204).send();
      }

      try {
        await upsertSchedule({
          jobType: jobName as JobType,
          cron: body.cron!,
          payload: body.payload ?? {},
          tz: body.tz?.trim() || undefined,
          key,
        });
      } catch (error) {
        request.log.warn(
          { error, jobName, key },
          'Failed to upsert schedule due to unavailable queue infrastructure'
        );
        await writeAuditSafe(request as RequestWithUser, {
          action: 'schedule-upsert',
          status: 'failed',
          targetJobName: jobName,
          details: { reason: 'queue-unavailable', key: key ?? null },
        });
        return sendQueueUnavailable(reply, 'Queue unavailable. Schedule update later.');
      }
      await writeAuditSafe(request as RequestWithUser, {
        action: 'schedule-upsert',
        status: 'success',
        targetJobName: jobName,
        details: { key: key ?? null, cron: body.cron ?? null },
      });
      return reply.status(204).send();
    }
  );

  /** GET /api/v1/admin/jobs/health – Queue-/Worker-Health für Admin-Statuskarte. */
  app.get('/admin/jobs/health', { preHandler: preAdmin }, async (request, reply) => {
    const prisma = request.server.prisma;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      return reply.status(503).send({
        status: 'error',
        workerConnected: false,
        queueReachable: false,
        message: 'Database/queue unreachable',
      });
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
      // Table may not exist before worker starts the first time.
      lastHeartbeat = null;
    }
    const workerConnected =
      lastHeartbeat != null && Date.now() - new Date(lastHeartbeat).getTime() < 60 * 1000;

    return reply.send({
      status: workerConnected ? 'ok' : 'degraded',
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
    });
  });

  /** GET /api/v1/admin/jobs/alerts – Alerts zu Queue-Lag/Failed-Jobs inkl. Schwellwerten. */
  app.get('/admin/jobs/alerts', { preHandler: preAdmin }, async (request, reply) => {
    const prisma = request.server.prisma;
    const queuedLagThresholdSeconds = Math.max(
      30,
      Number(process.env.JOBS_ALERT_QUEUED_LAG_SECONDS ?? DEFAULT_ALERT_QUEUED_LAG_SECONDS)
    );
    const failedRecentThresholdCount = Math.max(
      1,
      Number(process.env.JOBS_ALERT_FAILED_RECENT_COUNT ?? DEFAULT_ALERT_FAILED_RECENT_COUNT)
    );
    const failedRecentWindowMinutes = Math.max(
      1,
      Number(
        process.env.JOBS_ALERT_FAILED_RECENT_WINDOW_MINUTES ??
          DEFAULT_ALERT_FAILED_RECENT_WINDOW_MINUTES
      )
    );

    const [metrics] = await prisma.$queryRaw<AdminJobAlertMetricsRow[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE state::text IN ('created', 'retry'))::int AS queued_count,
        COUNT(*) FILTER (WHERE state::text = 'active')::int AS running_count,
        COUNT(*) FILTER (WHERE state::text = 'failed')::int AS failed_total_count,
        COUNT(*) FILTER (
          WHERE state::text = 'failed'
            AND completed_on >= NOW() - (${failedRecentWindowMinutes} * INTERVAL '1 minute')
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
    if (oldestQueuedLagSeconds != null && oldestQueuedLagSeconds >= queuedLagThresholdSeconds) {
      alerts.push({
        code: 'queue-lag',
        severity: oldestQueuedLagSeconds >= queuedLagThresholdSeconds * 2 ? 'critical' : 'warning',
        message: `Oldest queued job age ${oldestQueuedLagSeconds}s exceeds threshold ${queuedLagThresholdSeconds}s`,
      });
    }
    if (failedRecentCount >= failedRecentThresholdCount) {
      alerts.push({
        code: 'failed-jobs-spike',
        severity: failedRecentCount >= failedRecentThresholdCount * 2 ? 'critical' : 'warning',
        message: `${failedRecentCount} failed jobs in last ${failedRecentWindowMinutes} minutes`,
      });
    }

    return reply.send({
      status: alerts.length > 0 ? 'degraded' : 'ok',
      runbook: ASYNC_JOBS_RUNBOOK_PATH,
      thresholds: {
        queuedLagSeconds: queuedLagThresholdSeconds,
        failedRecentCount: failedRecentThresholdCount,
        failedRecentWindowMinutes,
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
    });
  });

  return Promise.resolve();
};

export default adminJobsRoutes;
