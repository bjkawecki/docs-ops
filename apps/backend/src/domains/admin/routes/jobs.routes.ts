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
} from '../schemas/jobs.js';
import { cancelJob, retryJob } from '../../../infrastructure/jobs/client.js';
import { jobTypes, type JobType } from '../../../infrastructure/jobs/jobTypes.js';
import {
  DEFAULT_ALERT_QUEUED_LAG_SECONDS,
  DEFAULT_ALERT_FAILED_RECENT_COUNT,
  DEFAULT_ALERT_FAILED_RECENT_WINDOW_MINUTES,
  retryFailedJobs,
  writeAdminJobAudit,
  getAdminJobActionRow,
  getAdminJobById,
  getAdminJobsAlerts,
  getAdminJobsHealth,
  isSchedulableJobType,
  listAdminJobAudit,
  listAdminJobSchedules,
  listAdminJobs,
  deleteAdminJobById,
  removeAdminJobSchedule,
  upsertAdminJobSchedule,
} from '../services/index.js';

const QUEUE_RETRY_AFTER_SECONDS = 15;

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
    const query = listAdminJobsQuerySchema.parse(request.query);
    const result = await listAdminJobs(request.server.prisma, query);
    return reply.send(result);
  });

  /** GET /api/v1/admin/jobs/:jobId – Job-Details (queue-übergreifend per UUID). */
  app.get<{ Params: { jobId: string } }>(
    '/admin/jobs/:jobId',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { jobId } = adminJobIdParamSchema.parse(request.params);
      const job = await getAdminJobById(request.server.prisma, jobId);
      if (!job) return reply.status(404).send({ error: 'Job not found' });
      return reply.send(job);
    }
  );

  /** POST /api/v1/admin/jobs/:jobId/retry – fehlgeschlagenen Job erneut einreihen. */
  app.post<{ Params: { jobId: string } }>(
    '/admin/jobs/:jobId/retry',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { jobId } = adminJobIdParamSchema.parse(request.params);
      const job = await getAdminJobActionRow(request.server.prisma, jobId);
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
      const { jobId } = adminJobIdParamSchema.parse(request.params);
      const job = await getAdminJobActionRow(request.server.prisma, jobId);
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
      const { jobId } = adminJobIdParamSchema.parse(request.params);
      const deleted = await deleteAdminJobById(request.server.prisma, jobId);
      if (!deleted) return reply.status(404).send({ error: 'Job not found' });
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
    const query = listAdminJobAuditQuerySchema.parse(request.query);
    const result = await listAdminJobAudit(request.server.prisma, query);
    return reply.send(result);
  });

  /** GET /api/v1/admin/jobs/schedules – geplante Jobs inkl. verfügbarer Jobtypen. */
  app.get('/admin/jobs/schedules', { preHandler: preAdmin }, async (request, reply) => {
    try {
      const result = await listAdminJobSchedules();
      return reply.send(result);
    } catch (error) {
      request.log.warn(
        { error },
        'Failed to load schedules due to unavailable queue infrastructure'
      );
      return sendQueueUnavailable(reply, 'Queue unavailable. Schedules not reachable.');
    }
  });

  /** PATCH /api/v1/admin/jobs/schedules/:jobName – Scheduler aktivieren/deaktivieren/ändern. */
  app.patch<{ Params: { jobName: string } }>(
    '/admin/jobs/schedules/:jobName',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { jobName } = adminJobNameParamSchema.parse(request.params);
      const body = patchAdminScheduleBodySchema.parse(request.body);
      if (!isSchedulableJobType(jobName)) {
        return reply.status(400).send({ error: 'Job type is not schedulable' });
      }

      const key = body.key?.trim() || undefined;
      if (!body.enabled) {
        try {
          await removeAdminJobSchedule(jobName as JobType, key);
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
        await upsertAdminJobSchedule({
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
    const health = await getAdminJobsHealth(request.server.prisma);
    return reply.status(health.queueReachable ? 200 : 503).send(health);
  });

  /** GET /api/v1/admin/jobs/alerts – Alerts zu Queue-Lag/Failed-Jobs inkl. Schwellwerten. */
  app.get('/admin/jobs/alerts', { preHandler: preAdmin }, async (request, reply) => {
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

    const result = await getAdminJobsAlerts(request.server.prisma, {
      queuedLagThresholdSeconds,
      failedRecentThresholdCount,
      failedRecentWindowMinutes,
    });
    return reply.send(result);
  });

  return Promise.resolve();
};

export default adminJobsRoutes;
