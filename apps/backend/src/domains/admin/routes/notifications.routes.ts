import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  requireAuthPreHandler,
  requireAdminPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../auth/middleware.js';
import {
  adminBroadcastBodySchema,
  adminBroadcastIdParamSchema,
  adminBroadcastListQuerySchema,
  adminBroadcastScheduleBodySchema,
} from '../schemas/notifications.js';
import { createAdminBroadcast } from '../services/adminBroadcastNotificationService.js';
import {
  listAdminBroadcastHistory,
  listScheduledAdminBroadcasts,
} from '../services/adminBroadcastRepository.js';
import {
  cancelScheduledAdminBroadcast,
  rescheduleScheduledAdminBroadcast,
  sendScheduledAdminBroadcastNow,
} from '../services/adminBroadcastScheduleService.js';

const adminNotificationsRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  const preAdmin = [requireAuthPreHandler, requireAdminPreHandler];

  app.post('/admin/notifications/broadcast', { preHandler: preAdmin }, async (request, reply) => {
    const body = adminBroadcastBodySchema.parse(request.body);
    const actorUserId = getEffectiveUserId(request as RequestWithUser);
    const sendAt = body.sendAt != null ? new Date(body.sendAt) : null;
    if (sendAt != null && Number.isNaN(sendAt.getTime())) {
      return reply.status(400).send({ error: 'Invalid sendAt datetime.' });
    }
    const result = await createAdminBroadcast(request.server.prisma, {
      actorUserId,
      title: body.title,
      message: body.message,
      targetKind: body.targetKind,
      userIds: body.userIds,
      sendAt,
    });
    return reply.status(201).send(result);
  });

  app.get('/admin/notifications/broadcasts', { preHandler: preAdmin }, async (request, reply) => {
    const query = adminBroadcastListQuerySchema.parse(request.query);
    const { items, total } = await listAdminBroadcastHistory(
      request.server.prisma,
      query.limit,
      query.offset,
      query.status
    );
    return reply.send({
      items: items.map((item) => ({
        id: item.id,
        actorUserId: item.actorUserId,
        title: item.title,
        message: item.message,
        targetKind: item.targetKind,
        status: item.status,
        deliveredCount: item.deliveredCount,
        createdAt: item.createdAt.toISOString(),
        scheduledAt: item.scheduledAt?.toISOString() ?? null,
        sentAt: item.sentAt?.toISOString() ?? null,
      })),
      total,
      limit: query.limit,
      offset: query.offset,
    });
  });

  app.get(
    '/admin/notifications/broadcasts/schedules',
    { preHandler: preAdmin },
    async (request, reply) => {
      const items = await listScheduledAdminBroadcasts(request.server.prisma);
      return reply.send({
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          message: item.message,
          targetKind: item.targetKind,
          scheduledAt: item.scheduledAt.toISOString(),
          actorUserId: item.actorUserId,
        })),
      });
    }
  );

  app.put<{ Params: { broadcastId: string } }>(
    '/admin/notifications/broadcasts/:broadcastId/schedule',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { broadcastId } = adminBroadcastIdParamSchema.parse(request.params);
      const body = adminBroadcastScheduleBodySchema.parse(request.body);
      const sendAt = new Date(body.sendAt);
      if (Number.isNaN(sendAt.getTime())) {
        return reply.status(400).send({ error: 'Invalid sendAt datetime.' });
      }
      try {
        const result = await rescheduleScheduledAdminBroadcast(
          request.server.prisma,
          broadcastId,
          sendAt
        );
        return reply.send(result);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Broadcast not found') {
            return reply.status(404).send({ error: error.message });
          }
          if (
            error.message === 'Only scheduled broadcasts can be rescheduled' ||
            error.message === 'Scheduled time must be in the future'
          ) {
            return reply.status(400).send({ error: error.message });
          }
        }
        throw error;
      }
    }
  );

  app.delete<{ Params: { broadcastId: string } }>(
    '/admin/notifications/broadcasts/:broadcastId/schedule',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { broadcastId } = adminBroadcastIdParamSchema.parse(request.params);
      try {
        await cancelScheduledAdminBroadcast(request.server.prisma, broadcastId);
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Broadcast not found') {
            return reply.status(404).send({ error: error.message });
          }
          if (error.message === 'Only scheduled broadcasts can be cancelled') {
            return reply.status(400).send({ error: error.message });
          }
        }
        throw error;
      }
    }
  );

  app.post<{ Params: { broadcastId: string } }>(
    '/admin/notifications/broadcasts/:broadcastId/send-now',
    { preHandler: preAdmin },
    async (request, reply) => {
      const { broadcastId } = adminBroadcastIdParamSchema.parse(request.params);
      try {
        const result = await sendScheduledAdminBroadcastNow(request.server.prisma, broadcastId);
        return reply.send(result);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Broadcast not found') {
            return reply.status(404).send({ error: error.message });
          }
          if (error.message === 'Only scheduled broadcasts can be sent now') {
            return reply.status(400).send({ error: error.message });
          }
        }
        throw error;
      }
    }
  );

  return Promise.resolve();
};

export default adminNotificationsRoutes;
