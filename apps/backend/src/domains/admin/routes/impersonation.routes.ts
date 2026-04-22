import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  IMPERSONATE_COOKIE_NAME,
  requireAdminPreHandler,
  requireAuthPreHandler,
} from '../../auth/middleware.js';
import { impersonateBodySchema } from '../schemas/impersonation.js';

const IMPERSONATE_COOKIE_MAX_AGE = 86400; // 1 Tag

const adminImpersonationRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  const preAdmin = [requireAuthPreHandler, requireAdminPreHandler];

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

  return Promise.resolve();
};

export default adminImpersonationRoutes;
