import type { FastifyInstance } from 'fastify';
import { Prisma } from '../../../../../generated/prisma/client.js';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../../auth/middleware.js';
import {
  markAllNotificationsReadBodySchema,
  meNotificationsQuerySchema,
  notificationIdParamSchema,
} from '../../schemas/me.js';
import { enrichMeNotificationItems, notificationsCategorySql } from './route-helpers.js';

function registerMeNotificationRoutes(app: FastifyInstance): void {
  app.get('/me/notifications', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = meNotificationsQuerySchema.parse(request.query);

    const unreadFilter = query.unreadOnly ? Prisma.sql`AND read_at IS NULL` : Prisma.empty;
    const categoryFilter = notificationsCategorySql(query.category);
    const [countRows, rows] = await Promise.all([
      request.server.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        FROM user_notification
        WHERE user_id = ${userId}
        ${unreadFilter}
        ${categoryFilter}
      `),
      request.server.prisma.$queryRaw<
        Array<{
          id: string;
          event_type: string;
          payload: unknown;
          created_at: Date;
          read_at: Date | null;
        }>
      >(Prisma.sql`
        SELECT id, event_type, payload, created_at, read_at
        FROM user_notification
        WHERE user_id = ${userId}
        ${unreadFilter}
        ${categoryFilter}
        ORDER BY created_at DESC
        LIMIT ${query.limit}
        OFFSET ${query.offset}
      `),
    ]);

    const enriched = await enrichMeNotificationItems(request.server.prisma, rows);
    return reply.send({
      items: enriched.map((row) => ({
        id: row.id,
        eventType: row.eventType,
        payload: row.payload,
        createdAt: row.createdAt,
        readAt: row.readAt,
        documentTitle: row.documentTitle,
      })),
      total: Number(countRows[0]?.total ?? 0n),
      limit: query.limit,
      offset: query.offset,
    });
  });

  app.patch<{ Params: { notificationId: string } }>(
    '/me/notifications/:notificationId/read',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const userId = getEffectiveUserId(request as RequestWithUser);
      const { notificationId } = notificationIdParamSchema.parse(request.params);
      const rows = await request.server.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE user_notification
        SET read_at = COALESCE(read_at, NOW())
        WHERE id = ${notificationId}
          AND user_id = ${userId}
        RETURNING id
      `);
      if (rows.length === 0) return reply.status(404).send({ error: 'Notification not found' });
      return reply.status(204).send();
    }
  );

  app.patch(
    '/me/notifications/read-all',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const userId = getEffectiveUserId(request as RequestWithUser);
      const body = markAllNotificationsReadBodySchema.parse(request.body ?? {});
      const before = body.before ? new Date(body.before) : null;
      if (before && Number.isNaN(before.getTime())) {
        return reply.status(400).send({ error: 'Invalid before timestamp' });
      }
      await request.server.prisma.$executeRaw`
      UPDATE user_notification
      SET read_at = COALESCE(read_at, NOW())
      WHERE user_id = ${userId}
        AND (${before == null}::boolean OR created_at <= ${before})
    `;
      return reply.status(204).send();
    }
  );
}

export { registerMeNotificationRoutes };
