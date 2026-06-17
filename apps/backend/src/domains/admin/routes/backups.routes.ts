import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  requireAuthPreHandler,
  requireAdminPreHandler,
  type RequestWithUser,
} from '../../auth/middleware.js';
import {
  backupDestinationIdParamSchema,
  backupRunIdParamSchema,
  createBackupBodySchema,
  createBackupDestinationBodySchema,
  listBackupRunsQuerySchema,
  patchBackupDestinationBodySchema,
  patchBackupScheduleBodySchema,
  patchBackupSettingsBodySchema,
} from '../schemas/backups.js';
import {
  createBackupDestination,
  deleteBackupDestination,
  getBackupSettings,
  listBackupDestinations,
  updateBackupDestination,
  updateBackupSettings,
} from '../services/adminBackupDestinationService.js';
import {
  deleteLocalBackupCopy,
  getLocalBackupDownload,
  getBackupRun,
  getBackupStatus,
  listBackupRuns,
  triggerManualBackup,
} from '../services/adminBackupRunService.js';
import { writeAdminBackupAudit } from '../services/adminBackupAuditService.js';
import { updateBackupSchedule } from '../services/adminBackupScheduleService.js';

const adminBackupsRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  const preAdmin = [requireAuthPreHandler, requireAdminPreHandler];

  const writeAuditSafe = async (
    request: RequestWithUser,
    args: Omit<Parameters<typeof writeAdminBackupAudit>[1], 'actorUserId'>
  ): Promise<void> => {
    try {
      await writeAdminBackupAudit(request.server.prisma, {
        ...args,
        actorUserId: request.user.id,
      });
    } catch (error) {
      request.log.warn({ error, action: args.action }, 'Failed to write backup audit entry');
    }
  };

  app.get('/admin/backups/status', { preHandler: preAdmin }, async (request, reply) => {
    const status = await getBackupStatus(request.server.prisma);
    return reply.send(status);
  });

  app.get('/admin/backups/settings', { preHandler: preAdmin }, async (request, reply) => {
    const settings = await getBackupSettings(request.server.prisma);
    return reply.send(settings);
  });

  app.patch('/admin/backups/settings', { preHandler: preAdmin }, async (request, reply) => {
    const body = patchBackupSettingsBodySchema.parse(request.body);
    try {
      const settings = await updateBackupSettings(request.server.prisma, body);
      await writeAuditSafe(request as RequestWithUser, {
        action: 'settings-update',
        status: 'success',
        details: body as Record<string, unknown>,
      });
      return reply.send(settings);
    } catch (error) {
      await writeAuditSafe(request as RequestWithUser, {
        action: 'settings-update',
        status: 'failed',
        details: { error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  });

  app.patch('/admin/backups/schedule', { preHandler: preAdmin }, async (request, reply) => {
    const body = patchBackupScheduleBodySchema.parse(request.body);
    try {
      const schedule = await updateBackupSchedule(request.server.prisma, body);
      await writeAuditSafe(request as RequestWithUser, {
        action: 'schedule-update',
        status: 'success',
        details: body as Record<string, unknown>,
      });
      return reply.send(schedule);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeAuditSafe(request as RequestWithUser, {
        action: 'schedule-update',
        status: 'failed',
        details: { error: message },
      });
      if (message.includes('not configured') || message.includes('Default backup destination')) {
        return reply.status(400).send({ error: message });
      }
      throw error;
    }
  });

  app.get('/admin/backup-destinations', { preHandler: preAdmin }, async (request, reply) => {
    const result = await listBackupDestinations(request.server.prisma);
    return reply.send(result);
  });

  app.post('/admin/backup-destinations', { preHandler: preAdmin }, async (request, reply) => {
    const body = createBackupDestinationBodySchema.parse(request.body);
    try {
      const created = await createBackupDestination(request.server.prisma, body);
      await writeAuditSafe(request as RequestWithUser, {
        action: 'destination-create',
        status: 'success',
        destinationId: created.id,
      });
      return reply.status(201).send(created);
    } catch (error) {
      await writeAuditSafe(request as RequestWithUser, {
        action: 'destination-create',
        status: 'failed',
        details: { error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>(
    '/admin/backup-destinations/:id',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { id } = backupDestinationIdParamSchema.parse(request.params);
      const body = patchBackupDestinationBodySchema.parse(request.body);
      try {
        const updated = await updateBackupDestination(request.server.prisma, id, body);
        if (!updated) return reply.status(404).send({ error: 'Destination not found' });
        await writeAuditSafe(request as RequestWithUser, {
          action: 'destination-update',
          status: 'success',
          destinationId: id,
        });
        return reply.send(updated);
      } catch (error) {
        await writeAuditSafe(request as RequestWithUser, {
          action: 'destination-update',
          status: 'failed',
          destinationId: id,
          details: { error: error instanceof Error ? error.message : String(error) },
        });
        throw error;
      }
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/admin/backup-destinations/:id',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { id } = backupDestinationIdParamSchema.parse(request.params);
      const deleted = await deleteBackupDestination(request.server.prisma, id);
      if (!deleted) return reply.status(404).send({ error: 'Destination not found' });
      await writeAuditSafe(request as RequestWithUser, {
        action: 'destination-delete',
        status: 'success',
        destinationId: id,
      });
      return reply.status(204).send();
    }
  );

  app.post('/admin/backups', { preHandler: preAdmin }, async (request, reply) => {
    const body = createBackupBodySchema.parse(request.body ?? {});
    const status = await getBackupStatus(request.server.prisma);
    if (!status.minioAvailable) {
      return reply.status(400).send({ error: 'MinIO is not configured or unreachable' });
    }
    if (!status.encryptionConfigured) {
      return reply.status(400).send({ error: 'BACKUP_ENCRYPTION_KEY is not configured' });
    }
    try {
      const result = await triggerManualBackup(request.server.prisma, {
        destinationId: body.destinationId,
        requestedByUserId: (request as RequestWithUser).user.id,
      });
      await writeAuditSafe(request as RequestWithUser, {
        action: 'backup-create',
        status: 'success',
        backupRunId: result.backupRunId,
        details: { jobId: result.jobId },
      });
      return reply.status(202).send(result);
    } catch (error) {
      await writeAuditSafe(request as RequestWithUser, {
        action: 'backup-create',
        status: 'failed',
        details: { error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  });

  app.get('/admin/backups', { preHandler: preAdmin }, async (request, reply) => {
    const query = listBackupRunsQuerySchema.parse(request.query);
    const result = await listBackupRuns(request.server.prisma, query);
    return reply.send(result);
  });

  app.get<{ Params: { id: string } }>(
    '/admin/backups/:id',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { id } = backupRunIdParamSchema.parse(request.params);
      const run = await getBackupRun(request.server.prisma, id);
      if (!run) return reply.status(404).send({ error: 'Backup not found' });
      return reply.send(run);
    }
  );

  app.get<{ Params: { id: string } }>(
    '/admin/backups/:id/download',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { id } = backupRunIdParamSchema.parse(request.params);
      const download = await getLocalBackupDownload(request.server.prisma, id);
      if (!download) {
        return reply.status(404).send({ error: 'Download not available for this backup' });
      }
      reply.header('Content-Type', download.contentType);
      reply.header('Content-Disposition', `attachment; filename="${download.filename}"`);
      reply.header('Cache-Control', 'private, no-store');
      return reply.send(download.body);
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/admin/backups/:id/local',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { id } = backupRunIdParamSchema.parse(request.params);
      try {
        const updated = await deleteLocalBackupCopy(request.server.prisma, id);
        if (!updated) return reply.status(404).send({ error: 'Backup not found' });
        await writeAuditSafe(request as RequestWithUser, {
          action: 'backup-local-delete',
          status: 'success',
          backupRunId: id,
        });
        return reply.send(updated);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await writeAuditSafe(request as RequestWithUser, {
          action: 'backup-local-delete',
          status: 'failed',
          backupRunId: id,
          details: { error: message },
        });
        if (message.includes('Only succeeded') || message.includes('already removed')) {
          return reply.status(400).send({ error: message });
        }
        throw error;
      }
    }
  );

  return Promise.resolve();
};

export default adminBackupsRoutes;
