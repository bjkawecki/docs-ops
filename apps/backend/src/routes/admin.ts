import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import {
  requireAuthPreHandler,
  requireAdminPreHandler,
  IMPERSONATE_COOKIE_NAME,
  type RequestWithUser,
} from '../auth/middleware.js';
import { hashPassword } from '../auth/password.js';
import {
  listUsersQuerySchema,
  listUserDocumentsQuerySchema,
  createUserBodySchema,
  updateUserBodySchema,
  resetPasswordBodySchema,
  userIdParamSchema,
  impersonateBodySchema,
  listAdminJobsQuerySchema,
  adminJobIdParamSchema,
  adminJobNameParamSchema,
  listAdminJobAuditQuerySchema,
  patchAdminScheduleBodySchema,
  retryFailedJobsBodySchema,
} from './schemas/admin.js';
import { setOwnerDisplayName, refreshContextOwnerDisplayForOwner } from '../contextOwnerDisplay.js';
import {
  companyIdParamSchema,
  departmentIdParamSchema,
  teamIdParamSchema,
} from './schemas/organisation.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { GrantRole, Prisma } from '../../generated/prisma/client.js';
import {
  cancelJob,
  getSchedules,
  retryJob,
  upsertSchedule,
  removeSchedule,
} from '../jobs/client.js';
import { jobTypes, type JobType } from '../jobs/jobTypes.js';
import { retryFailedJobs } from '../services/adminJobService.js';
import { writeAdminJobAudit } from '../services/adminJobAuditService.js';

const IMPERSONATE_COOKIE_MAX_AGE = 86400; // 1 Tag
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

async function getOwnerScopeDocumentAndContextCounts(
  prisma: PrismaClient,
  ownerIds: string[]
): Promise<{ documentCount: number; processCount: number; projectCount: number }> {
  if (ownerIds.length === 0) {
    return { documentCount: 0, processCount: 0, projectCount: 0 };
  }
  const [processes, projects, processCount, projectCount] = await Promise.all([
    prisma.process.findMany({
      where: { ownerId: { in: ownerIds }, deletedAt: null },
      select: { contextId: true },
    }),
    prisma.project.findMany({
      where: { ownerId: { in: ownerIds }, deletedAt: null },
      select: { id: true, contextId: true },
    }),
    prisma.process.count({
      where: { ownerId: { in: ownerIds }, deletedAt: null },
    }),
    prisma.project.count({
      where: { ownerId: { in: ownerIds }, deletedAt: null },
    }),
  ]);
  const projectIds = projects.map((p) => p.id);
  const subcontexts =
    projectIds.length > 0
      ? await prisma.subcontext.findMany({
          where: { projectId: { in: projectIds } },
          select: { contextId: true },
        })
      : [];
  const contextIds = [
    ...processes.map((p) => p.contextId),
    ...projects.map((p) => p.contextId),
    ...subcontexts.map((s) => s.contextId),
  ];
  const documentCount =
    contextIds.length > 0
      ? await prisma.document.count({
          where: { contextId: { in: contextIds }, deletedAt: null },
        })
      : 0;
  return {
    documentCount,
    processCount,
    projectCount,
  };
}

const adminRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
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

  /** POST /api/v1/admin/impersonate – Ansicht als Nutzer X (setzt Cookie, nur Admin). */
  app.post('/admin/impersonate', { preHandler: preAdmin }, async (request, reply) => {
    const body = impersonateBodySchema.parse(request.body);
    const target = await request.server.prisma.user.findFirst({
      where: { id: body.userId.trim(), deletedAt: null },
      select: { id: true },
    });
    if (!target) {
      return reply.status(404).send({ error: 'User not found or deactivated' });
    }
    reply.setCookie(IMPERSONATE_COOKIE_NAME, target.id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: IMPERSONATE_COOKIE_MAX_AGE,
    });
    return reply.status(204).send();
  });

  /** DELETE /api/v1/admin/impersonate – Impersonation beenden. */
  app.delete('/admin/impersonate', { preHandler: preAdmin }, async (_request, reply) => {
    reply.clearCookie(IMPERSONATE_COOKIE_NAME, { path: '/' });
    return reply.status(204).send();
  });

  /** GET /api/v1/admin/users – Nutzerliste (paginiert, Filter, Suche, Sortierung). */
  app.get('/admin/users', { preHandler: preAdmin }, async (request, reply) => {
    const query = listUsersQuerySchema.parse(request.query);
    const where: {
      deletedAt?: null | { not: null };
      OR?: Array<{
        name?: { contains: string; mode: 'insensitive' };
        email?: { contains: string; mode: 'insensitive' };
      }>;
    } = {};
    if (!query.includeDeactivated) {
      where.deletedAt = null;
    }
    if (query.search && query.search.trim() !== '') {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    const sortByRelation =
      query.sortBy === 'teams' || query.sortBy === 'departments' || query.sortBy === 'role';
    const CAP_FOR_RELATION_SORT = 5000;

    let users: Array<{
      id: string;
      name: string;
      email: string | null;
      isAdmin: boolean;
      deletedAt: string | null;
    }>;
    let total: number;

    if (sortByRelation) {
      const [usersAll, totalCount] = await Promise.all([
        request.server.prisma.user.findMany({
          where,
          select: { id: true, name: true, email: true, isAdmin: true, deletedAt: true },
          orderBy: { name: 'asc' },
          take: CAP_FOR_RELATION_SORT,
        }),
        request.server.prisma.user.count({ where }),
      ]);
      users = usersAll;
      total = totalCount > CAP_FOR_RELATION_SORT ? CAP_FOR_RELATION_SORT : totalCount;
    } else {
      const dbSortField = query.sortBy === 'role' ? undefined : query.sortBy;
      const orderBy = dbSortField
        ? ({ [dbSortField]: query.sortOrder } as {
            name?: 'asc' | 'desc';
            email?: 'asc' | 'desc';
            isAdmin?: 'asc' | 'desc';
            deletedAt?: 'asc' | 'desc';
          })
        : { name: 'asc' as const };
      const [usersPage, totalCount] = await Promise.all([
        request.server.prisma.user.findMany({
          where,
          select: { id: true, name: true, email: true, isAdmin: true, deletedAt: true },
          orderBy,
          take: query.limit,
          skip: query.offset,
        }),
        request.server.prisma.user.count({ where }),
      ]);
      users = usersPage;
      total = totalCount;
    }

    const userIds = users.map((u) => u.id);
    const [teamLeadRows, departmentLeadRows, companyLeadRows, teamMemberRows] = await Promise.all([
      request.server.prisma.teamLead.findMany({
        where: { userId: { in: userIds } },
        select: {
          userId: true,
          teamId: true,
          team: {
            select: { id: true, name: true, department: { select: { id: true, name: true } } },
          },
        },
      }),
      request.server.prisma.departmentLead.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, department: { select: { id: true, name: true } } },
      }),
      request.server.prisma.companyLead.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, company: { select: { id: true, name: true } } },
      }),
      request.server.prisma.teamMember.findMany({
        where: { userId: { in: userIds } },
        select: {
          userId: true,
          team: {
            select: { id: true, name: true, department: { select: { id: true, name: true } } },
          },
        },
      }),
    ]);
    const teamLeadSet = new Set(teamLeadRows.map((r) => r.userId));
    const departmentLeadSet = new Set(departmentLeadRows.map((r) => r.userId));
    const companyLeadSet = new Set(companyLeadRows.map((r) => r.userId));
    const teamsByUser = new Map<
      string,
      Array<{ id: string; name: string; departmentName: string }>
    >();
    const departmentsByUser = new Map<string, Array<{ id: string; name: string }>>();
    const departmentsAsLeadByUser = new Map<string, Array<{ id: string; name: string }>>();
    for (const r of teamMemberRows) {
      if (!r.team?.department) continue;
      const list = teamsByUser.get(r.userId) ?? [];
      if (!list.some((t) => t.id === r.team.id)) {
        list.push({ id: r.team.id, name: r.team.name, departmentName: r.team.department.name });
      }
      teamsByUser.set(r.userId, list);
      const deptList = departmentsByUser.get(r.userId) ?? [];
      if (!deptList.some((d) => d.id === r.team.department.id)) {
        deptList.push({ id: r.team.department.id, name: r.team.department.name });
      }
      departmentsByUser.set(r.userId, deptList);
    }
    for (const r of teamLeadRows) {
      if (!r.team?.department) continue;
      const list = teamsByUser.get(r.userId) ?? [];
      if (!list.some((t) => t.id === r.team.id)) {
        list.push({ id: r.team.id, name: r.team.name, departmentName: r.team.department.name });
      }
      teamsByUser.set(r.userId, list);
      const deptList = departmentsByUser.get(r.userId) ?? [];
      if (!deptList.some((d) => d.id === r.team.department.id)) {
        deptList.push({ id: r.team.department.id, name: r.team.department.name });
      }
      departmentsByUser.set(r.userId, deptList);
    }
    for (const r of departmentLeadRows) {
      const deptList = departmentsByUser.get(r.userId) ?? [];
      if (!deptList.some((d) => d.id === r.department.id)) {
        deptList.push({ id: r.department.id, name: r.department.name });
      }
      departmentsByUser.set(r.userId, deptList);
      const leadList = departmentsAsLeadByUser.get(r.userId) ?? [];
      leadList.push({ id: r.department.id, name: r.department.name });
      departmentsAsLeadByUser.set(r.userId, leadList);
    }
    let items = users.map((u) => {
      const role = u.isAdmin
        ? ('Admin' as const)
        : companyLeadSet.has(u.id)
          ? ('Company Lead' as const)
          : departmentLeadSet.has(u.id)
            ? ('Department Lead' as const)
            : teamLeadSet.has(u.id)
              ? ('Team Lead' as const)
              : ('User' as const);
      const teamsRaw = teamsByUser.get(u.id) ?? [];
      const teams = teamsRaw.map((t) => ({
        ...t,
        isLead: teamLeadRows.some((r) => r.userId === u.id && r.teamId === t.id),
      }));
      const departments = departmentsByUser.get(u.id) ?? [];
      const departmentsAsLead = departmentsAsLeadByUser.get(u.id) ?? [];
      return {
        ...u,
        role,
        teams,
        departments,
        departmentsAsLead,
      };
    });

    if (sortByRelation) {
      const dir = query.sortOrder === 'asc' ? 1 : -1;
      if (query.sortBy === 'role') {
        items.sort((a, b) => dir * (a.role < b.role ? -1 : a.role > b.role ? 1 : 0));
      } else {
        const key = query.sortBy === 'teams' ? 'teams' : 'departments';
        items.sort((a, b) => {
          const aStr =
            key === 'teams'
              ? [...a.teams]
                  .map((t) => t.name)
                  .sort()
                  .join(', ') || '\uFFFF'
              : [...a.departments]
                  .map((d) => d.name)
                  .sort()
                  .join(', ') || '\uFFFF';
          const bStr =
            key === 'teams'
              ? [...b.teams]
                  .map((t) => t.name)
                  .sort()
                  .join(', ') || '\uFFFF'
              : [...b.departments]
                  .map((d) => d.name)
                  .sort()
                  .join(', ') || '\uFFFF';
          return dir * (aStr < bStr ? -1 : aStr > bStr ? 1 : 0);
        });
      }
      items = items.slice(query.offset, query.offset + query.limit);
    }

    const activeAdminCount = await request.server.prisma.user.count({
      where: { isAdmin: true, deletedAt: null },
    });

    return reply.send({
      items,
      total,
      limit: query.limit,
      offset: query.offset,
      activeAdminCount,
    });
  });

  /** GET /api/v1/admin/users/:userId/stats – Kennzahlen für User-Detail. */
  app.get<{ Params: { userId: string } }>(
    '/admin/users/:userId/stats',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { userId } = userIdParamSchema.parse(request.params);
      const user = await request.server.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        return reply.status(404).send({ error: 'User not found.' });
      }
      const [storageBytesUsed, documentsAsWriterCount, draftsCount] = await Promise.all([
        request.server.prisma.documentAttachment.aggregate({
          where: { uploadedById: userId },
          _sum: { sizeBytes: true },
        }),
        request.server.prisma.documentGrantUser.count({
          where: { userId, role: GrantRole.Write },
        }),
        request.server.prisma.documentDraft.count({
          where: { userId },
        }),
      ]);
      return reply.send({
        storageBytesUsed: storageBytesUsed._sum.sizeBytes ?? 0,
        documentsAsWriterCount,
        draftsCount,
      });
    }
  );

  /** GET /api/v1/admin/companies/:companyId/stats – Kennzahlen für Company (Storage, Departments, Teams, Members, Documents, Processes, Projects). */
  app.get<{ Params: { companyId: string } }>(
    '/admin/companies/:companyId/stats',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { companyId } = companyIdParamSchema.parse(request.params);
      const prisma = request.server.prisma;
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });
      if (!company) {
        return reply.status(404).send({ error: 'Company not found.' });
      }
      const departments = await prisma.department.findMany({
        where: { companyId },
        select: { id: true },
      });
      const departmentIds = departments.map((d) => d.id);
      const teams = await prisma.team.findMany({
        where: { departmentId: { in: departmentIds } },
        select: { id: true },
      });
      const teamIds = teams.map((t) => t.id);
      const members = await prisma.teamMember.findMany({
        where: { teamId: { in: teamIds } },
        select: { userId: true },
      });
      const userIds = [...new Set(members.map((m) => m.userId))];
      const owners = await prisma.owner.findMany({
        where: { companyId },
        select: { id: true },
      });
      const ownerIds = owners.map((o) => o.id);
      const [storageResult, departmentCount, scopeCounts] = await Promise.all([
        userIds.length > 0
          ? prisma.documentAttachment.aggregate({
              where: { uploadedById: { in: userIds } },
              _sum: { sizeBytes: true },
            })
          : Promise.resolve({ _sum: { sizeBytes: null as number | null } }),
        prisma.department.count({ where: { companyId } }),
        getOwnerScopeDocumentAndContextCounts(prisma, ownerIds),
      ]);
      return reply.send({
        storageBytesUsed: storageResult._sum.sizeBytes ?? 0,
        departmentCount,
        teamCount: teams.length,
        memberCount: userIds.length,
        documentCount: scopeCounts.documentCount,
        processCount: scopeCounts.processCount,
        projectCount: scopeCounts.projectCount,
      });
    }
  );

  /** GET /api/v1/admin/departments/:departmentId/stats – Kennzahlen für Department (Storage, Teams, Members, Documents, Processes, Projects). */
  app.get<{ Params: { departmentId: string } }>(
    '/admin/departments/:departmentId/stats',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      const prisma = request.server.prisma;
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
        select: { id: true },
      });
      if (!department) {
        return reply.status(404).send({ error: 'Department not found.' });
      }
      const teams = await prisma.team.findMany({
        where: { departmentId },
        select: { id: true },
      });
      const teamIds = teams.map((t) => t.id);
      const members = await prisma.teamMember.findMany({
        where: { teamId: { in: teamIds } },
        select: { userId: true },
      });
      const userIds = [...new Set(members.map((m) => m.userId))];
      const owners = await prisma.owner.findMany({
        where: { departmentId },
        select: { id: true },
      });
      const ownerIds = owners.map((o) => o.id);
      const [storageResult, teamCount, memberCount, scopeCounts] = await Promise.all([
        userIds.length > 0
          ? prisma.documentAttachment.aggregate({
              where: { uploadedById: { in: userIds } },
              _sum: { sizeBytes: true },
            })
          : Promise.resolve({ _sum: { sizeBytes: null as number | null } }),
        prisma.team.count({ where: { departmentId } }),
        Promise.resolve(userIds.length),
        getOwnerScopeDocumentAndContextCounts(prisma, ownerIds),
      ]);
      return reply.send({
        storageBytesUsed: storageResult._sum.sizeBytes ?? 0,
        teamCount,
        memberCount,
        documentCount: scopeCounts.documentCount,
        processCount: scopeCounts.processCount,
        projectCount: scopeCounts.projectCount,
      });
    }
  );

  /** GET /api/v1/admin/teams/:teamId/members – Mitgliederliste (Admin, ohne canViewTeam). */
  app.get<{ Params: { teamId: string } }>(
    '/admin/teams/:teamId/members',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const limit = Math.min(Number(request.query?.limit) || 500, 500);
      const offset = Math.max(0, Number(request.query?.offset) || 0);
      const team = await request.server.prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true },
      });
      if (!team) {
        return reply.status(404).send({ error: 'Team not found.' });
      }
      const [items, total] = await Promise.all([
        request.server.prisma.teamMember.findMany({
          where: { teamId },
          include: { user: { select: { id: true, name: true } } },
          take: limit,
          skip: offset,
          orderBy: { userId: 'asc' },
        }),
        request.server.prisma.teamMember.count({ where: { teamId } }),
      ]);
      const list = items.map((m) => ({ id: m.user.id, name: m.user.name }));
      return reply.send({ items: list, total, limit, offset });
    }
  );

  /** GET /api/v1/admin/teams/:teamId/stats – Kennzahlen für Team (Storage, Members, Documents, Processes, Projects). */
  app.get<{ Params: { teamId: string } }>(
    '/admin/teams/:teamId/stats',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const prisma = request.server.prisma;
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true },
      });
      if (!team) {
        return reply.status(404).send({ error: 'Team not found.' });
      }
      const members = await prisma.teamMember.findMany({
        where: { teamId },
        select: { userId: true },
      });
      const userIds = members.map((m) => m.userId);
      const owners = await prisma.owner.findMany({
        where: { teamId },
        select: { id: true },
      });
      const ownerIds = owners.map((o) => o.id);
      const [storageResult, memberCount, scopeCounts] = await Promise.all([
        userIds.length > 0
          ? prisma.documentAttachment.aggregate({
              where: { uploadedById: { in: userIds } },
              _sum: { sizeBytes: true },
            })
          : Promise.resolve({ _sum: { sizeBytes: null as number | null } }),
        prisma.teamMember.count({ where: { teamId } }),
        getOwnerScopeDocumentAndContextCounts(prisma, ownerIds),
      ]);
      return reply.send({
        storageBytesUsed: storageResult._sum.sizeBytes ?? 0,
        memberCount,
        documentCount: scopeCounts.documentCount,
        processCount: scopeCounts.processCount,
        projectCount: scopeCounts.projectCount,
      });
    }
  );

  /** GET /api/v1/admin/departments/member-counts – Pro Department Anzahl verschiedener User (in allen Teams). */
  app.get('/admin/departments/member-counts', { preHandler: preAdmin }, async (request, reply) => {
    const rawIds = (request.query as { ids?: string }).ids;
    const departmentIds =
      typeof rawIds === 'string' && rawIds.trim()
        ? rawIds
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : null;
    const teamMembers = await request.server.prisma.teamMember.findMany({
      where: departmentIds ? { team: { departmentId: { in: departmentIds } } } : undefined,
      select: { userId: true, team: { select: { departmentId: true } } },
    });
    const byDept = new Map<string, Set<string>>();
    for (const m of teamMembers) {
      const deptId = m.team.departmentId;
      if (!byDept.has(deptId)) byDept.set(deptId, new Set());
      byDept.get(deptId)!.add(m.userId);
    }
    const result: Record<string, number> = {};
    for (const [deptId, userIds] of byDept) {
      result[deptId] = userIds.size;
    }
    return reply.send(result);
  });

  /** GET /api/v1/admin/users/:userId/documents – Dokumente, bei denen User Writer ist (direkte User-Grants). */
  app.get<{ Params: { userId: string } }>(
    '/admin/users/:userId/documents',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { userId } = userIdParamSchema.parse(request.params);
      const query = listUserDocumentsQuerySchema.parse(request.query);
      const user = await request.server.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        return reply.status(404).send({ error: 'User not found.' });
      }
      const whereDoc = {
        deletedAt: null,
        grantUser: {
          some: { userId, role: GrantRole.Write },
        },
        ...(query.search?.trim() && {
          title: { contains: query.search.trim(), mode: 'insensitive' as const },
        }),
      };
      const [items, total] = await Promise.all([
        request.server.prisma.document.findMany({
          where: whereDoc,
          select: { id: true, title: true },
          orderBy: { title: 'asc' },
          take: query.limit,
          skip: query.offset,
        }),
        request.server.prisma.document.count({ where: whereDoc }),
      ]);
      return reply.send({
        items,
        total,
        limit: query.limit,
        offset: query.offset,
      });
    }
  );

  /** POST /api/v1/admin/users – Nutzer anlegen. */
  app.post('/admin/users', { preHandler: preAdmin }, async (request, reply) => {
    const body = createUserBodySchema.parse(request.body);
    const existing = await request.server.prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true },
    });
    if (existing) {
      return reply.status(409).send({ error: 'This email address is already in use.' });
    }
    const passwordHash = await hashPassword(body.password);
    const user = await request.server.prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash,
        isAdmin: body.isAdmin ?? false,
      },
      select: { id: true, name: true, email: true, isAdmin: true, deletedAt: true },
    });
    return reply.status(201).send(user);
  });

  /** PATCH /api/v1/admin/users/:userId – Nutzer bearbeiten / Deaktivierung / Reaktivierung. */
  app.patch<{ Params: { userId: string } }>(
    '/admin/users/:userId',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { userId } = userIdParamSchema.parse(request.params);
      const body = updateUserBodySchema.parse(request.body);

      const target = await request.server.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, isAdmin: true, deletedAt: true },
      });
      if (!target) {
        return reply.status(404).send({ error: 'User not found.' });
      }

      const adminCount = await request.server.prisma.user.count({
        where: { isAdmin: true, deletedAt: null },
      });
      if (body.isAdmin === false && target.isAdmin && adminCount <= 1) {
        return reply.status(403).send({
          error: 'The last administrator cannot be changed to a regular user.',
        });
      }
      if (
        body.deletedAt !== undefined &&
        body.deletedAt !== null &&
        target.isAdmin &&
        adminCount <= 1
      ) {
        return reply.status(403).send({
          error: 'The last administrator cannot be deactivated.',
        });
      }

      if (body.email !== undefined) {
        const existing = await request.server.prisma.user.findUnique({
          where: { email: body.email ?? '' },
          select: { id: true },
        });
        if (existing && existing.id !== userId) {
          return reply.status(409).send({ error: 'This email address is already in use.' });
        }
      }

      const data: {
        name?: string;
        email?: string | null;
        isAdmin?: boolean;
        deletedAt?: Date | null;
      } = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.email !== undefined) data.email = body.email;
      if (body.isAdmin !== undefined) data.isAdmin = body.isAdmin;
      if (body.deletedAt !== undefined) {
        data.deletedAt = body.deletedAt === null ? null : new Date(body.deletedAt);
      }

      if (data.deletedAt != null) {
        await request.server.prisma.session.deleteMany({ where: { userId } });
      }

      const updated = await request.server.prisma.user.update({
        where: { id: userId },
        data,
        select: { id: true, name: true, email: true, isAdmin: true, deletedAt: true },
      });
      if (data.name !== undefined) {
        const prisma = request.server.prisma;
        const owners = await prisma.owner.findMany({
          where: { ownerUserId: userId },
          select: { id: true },
        });
        for (const o of owners) {
          await setOwnerDisplayName(prisma, o.id);
          await refreshContextOwnerDisplayForOwner(prisma, o.id);
        }
      }
      return reply.send(updated);
    }
  );

  /** POST /api/v1/admin/users/:userId/reset-password – Admin setzt Passwort. */
  app.post<{ Params: { userId: string } }>(
    '/admin/users/:userId/reset-password',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { userId } = userIdParamSchema.parse(request.params);
      const body = resetPasswordBodySchema.parse(request.body);

      const user = await request.server.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, passwordHash: true },
      });
      if (!user) {
        return reply.status(404).send({ error: 'User not found.' });
      }
      if (user.passwordHash == null) {
        return reply.status(400).send({
          error: 'This user has no local login (SSO). Password cannot be set.',
        });
      }

      const passwordHash = await hashPassword(body.newPassword);
      await request.server.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      return reply.status(204).send();
    }
  );

  /** POST /api/v1/admin/users/:userId/reset-password/trigger – Admin löst Passwort-Reset aus (z. B. E-Mail). */
  app.post<{ Params: { userId: string } }>(
    '/admin/users/:userId/reset-password/trigger',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { userId } = userIdParamSchema.parse(request.params);

      const user = await request.server.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, passwordHash: true },
      });
      if (!user) {
        return reply.status(404).send({ error: 'User not found.' });
      }
      if (user.passwordHash == null) {
        return reply.status(400).send({
          error: 'This user has no local login (SSO). Password reset is not applicable.',
        });
      }

      // Placeholder: später z. B. Reset-Token anlegen und E-Mail versenden
      return reply.status(204).send();
    }
  );

  /** DELETE /api/v1/admin/users/:userId – Nutzer endgültig löschen (nur Admin). Irreversibel. */
  app.delete<{ Params: { userId: string } }>(
    '/admin/users/:userId',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { userId } = userIdParamSchema.parse(request.params);
      const currentUserId = (request as RequestWithUser).user.id;
      if (currentUserId === userId) {
        return reply.status(403).send({ error: 'You cannot delete your own user account.' });
      }

      const user = await request.server.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!user) {
        return reply.status(404).send({ error: 'User not found.' });
      }

      await request.server.prisma.session.deleteMany({ where: { userId } });
      await request.server.prisma.user.delete({ where: { id: userId } });
      return reply.status(204).send();
    }
  );

  return Promise.resolve();
};

export default adminRoutes;
