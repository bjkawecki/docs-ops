import type { FastifyInstance } from 'fastify';
import { requireAuthPreHandler, SESSION_COOKIE_NAME } from '../../../auth/middleware.js';
import type { RequestUser } from '../../../auth/types.js';
import { hashPassword, verifyPassword } from '../../../auth/services/password.js';
import { patchAccountBodySchema, sessionIdParamSchema } from '../../schemas/me.js';

function registerMeAccountSessionRoutes(app: FastifyInstance): void {
  app.patch('/me/account', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const body = patchAccountBodySchema.parse(request.body);

    const user = await request.server.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true, email: true },
    });
    if (user.passwordHash == null) {
      return reply.status(400).send({
        error: 'Account is managed by SSO. Email and password cannot be changed here.',
      });
    }

    const data: { email?: string | null; passwordHash?: string } = {};
    if (body.email !== undefined) {
      if (body.email !== null) {
        const existing = await request.server.prisma.user.findUnique({
          where: { email: body.email },
          select: { id: true },
        });
        if (existing && existing.id !== userId) {
          return reply.status(409).send({ error: 'This email address is already in use.' });
        }
      }
      data.email = body.email;
    }

    if (body.newPassword !== undefined) {
      if (!body.currentPassword) {
        return reply
          .status(400)
          .send({ error: 'Current password is required to change password.' });
      }
      const valid = await verifyPassword(user.passwordHash, body.currentPassword);
      if (!valid) {
        return reply.status(401).send({ error: 'Current password is incorrect.' });
      }
      data.passwordHash = await hashPassword(body.newPassword);
    }

    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'Nothing to update (provide email or newPassword).' });
    }

    await request.server.prisma.user.update({
      where: { id: userId },
      data,
    });
    return reply.status(204).send();
  });

  app.get('/me/sessions', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const currentSessionId = request.cookies[SESSION_COOKIE_NAME] ?? null;

    const sessions = await request.server.prisma.session.findMany({
      where: { userId },
      select: { id: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const list = sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      isCurrent: currentSessionId === session.id,
    }));
    return reply.send({ sessions: list });
  });

  app.delete('/me/sessions', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const currentSessionId = request.cookies[SESSION_COOKIE_NAME];
    if (currentSessionId) {
      await request.server.prisma.session.deleteMany({
        where: { userId, id: { not: currentSessionId } },
      });
    }
    return reply.status(204).send();
  });

  app.delete<{ Params: { sessionId: string } }>(
    '/me/sessions/:sessionId',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const userId = (request as { user: RequestUser }).user.id;
      const { sessionId } = sessionIdParamSchema.parse(request.params);

      const session = await request.server.prisma.session.findFirst({
        where: { id: sessionId, userId },
      });
      if (!session) {
        return reply.status(404).send({ error: 'Session not found.' });
      }
      await request.server.prisma.session.delete({ where: { id: sessionId } });
      return reply.status(204).send();
    }
  );
}

export { registerMeAccountSessionRoutes };
