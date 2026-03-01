import type { FastifyRequest, FastifyReply } from 'fastify';
import { findValidSession } from './session.js';
import type { RequestUser } from './types.js';

export const SESSION_COOKIE_NAME = 'sessionId';
export type { RequestUser };

/**
 * PreHandler: Liest Session-Cookie, lädt Session und User aus Postgres, hängt User an request.user.
 * Bei fehlender/ungültiger/abgelaufener Session → 401.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sessionId = request.cookies[SESSION_COOKIE_NAME];
  if (!sessionId || typeof sessionId !== 'string') {
    return reply.status(401).send({ error: 'Nicht angemeldet' });
  }
  const result = await findValidSession(request.server.prisma, sessionId);
  if (!result) {
    return reply.status(401).send({ error: 'Ungültige oder abgelaufene Session' });
  }
  (request as FastifyRequest & { user: RequestUser }).user = result.user;
}

/**
 * PreHandler: Muss nach requireAuth laufen. Prüft request.user.isAdmin; sonst 403.
 * Für Organisation (Company, Department, Team) und andere Admin-only Aktionen.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = (request as FastifyRequest & { user?: RequestUser }).user;
  if (!user) {
    return reply.status(401).send({ error: 'Nicht angemeldet' });
  }
  if (!user.isAdmin) {
    return reply.status(403).send({ error: 'Administrators only' });
  }
}
