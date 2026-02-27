import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { loginBodySchema } from './schemas.js';
import { verifyPassword } from './password.js';
import { createSession, deleteSession } from './session.js';
import { requireAuth, SESSION_COOKIE_NAME } from './middleware.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};

const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /** POST /api/v1/auth/login – Body: { email, password }; bei Erfolg Set-Cookie, 204. */
  app.post('/auth/login', async (request, reply) => {
    const parseResult = loginBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Ungültige Eingabe',
        details: parseResult.error.flatten().fieldErrors,
      });
    }
    const { email, password } = parseResult.data;

    const user = await request.server.prisma.user.findUnique({
      where: { email },
    });
    if (!user || user.deletedAt || !user.passwordHash) {
      return reply.status(401).send({ error: 'Anmeldung fehlgeschlagen' });
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      return reply.status(401).send({ error: 'Anmeldung fehlgeschlagen' });
    }

    const { id, expiresAt } = await createSession(request.server.prisma, user.id);
    const maxAgeSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    return reply
      .setCookie(SESSION_COOKIE_NAME, id, {
        ...COOKIE_OPTIONS,
        maxAge: maxAgeSeconds,
      })
      .status(204)
      .send();
  });

  /** POST /api/v1/auth/logout – Session löschen, Cookie entfernen, 204. */
  app.post('/auth/logout', async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE_NAME];
    if (sessionId && typeof sessionId === 'string') {
      await deleteSession(request.server.prisma, sessionId);
    }
    return reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' }).status(204).send();
  });

  /** GET /api/v1/auth/me – aktueller User (geschützt). */
  app.get('/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!;
    return reply.send({
      id: user.id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
    });
  });
};

export { authRoutes };
