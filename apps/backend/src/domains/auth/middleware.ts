import type { FastifyRequest, FastifyReply } from 'fastify';
import { findValidSession } from './services/session.js';
import type { RequestUser } from './types.js';

export const SESSION_COOKIE_NAME = 'sessionId';
/** Cookie für Admin-Impersonation (Ziel-User-ID). Nur gültig wenn Session-User isAdmin. */
export const IMPERSONATE_COOKIE_NAME = 'impersonateUserId';
export type { RequestUser };

export type RequestWithUser = FastifyRequest & {
  user: RequestUser;
  effectiveUserId?: string;
};

/**
 * Gibt die für diese Anfrage gültige User-ID zurück (Impersonation oder echter User).
 * Nur nach requireAuth aufrufen; wirft nicht, wenn request.user gesetzt ist.
 */
export function getEffectiveUserId(request: RequestWithUser): string {
  return request.effectiveUserId ?? request.user.id;
}

/**
 * PreHandler: Liest Session-Cookie, lädt Session und User aus Postgres, hängt User an request.user.
 * Bei fehlender/ungültiger/abgelaufener Session → 401.
 * Wenn User Admin und Cookie impersonateUserId gesetzt: prüft Ziel-User (existiert, nicht gelöscht),
 * setzt request.effectiveUserId oder löscht ungültiges Cookie.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sessionId = request.cookies[SESSION_COOKIE_NAME];
  if (!sessionId || typeof sessionId !== 'string') {
    return reply.status(401).send({ error: 'Nicht angemeldet' });
  }
  const result = await findValidSession(request.server.prisma, sessionId);
  if (!result) {
    return reply.status(401).send({ error: 'Invalid or expired session' });
  }
  const req = request as RequestWithUser;
  req.user = result.user;

  const impersonateId = request.cookies[IMPERSONATE_COOKIE_NAME];
  if (req.user.isAdmin && typeof impersonateId === 'string' && impersonateId.trim() !== '') {
    const target = await request.server.prisma.user.findFirst({
      where: { id: impersonateId.trim(), deletedAt: null },
      select: { id: true },
    });
    if (target) {
      req.effectiveUserId = target.id;
    } else {
      reply.clearCookie(IMPERSONATE_COOKIE_NAME, { path: '/' });
    }
  }
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

/**
 * Für preHandler-Option: Fastify awaited PreHandler-Promises; manche Typen erwarten void.
 * Verwendung: preHandler: requireAuthPreHandler bzw. requireAdminPreHandler.
 */
export const requireAuthPreHandler = requireAuth as (
  req: FastifyRequest,
  reply: FastifyReply
) => void;
export const requireAdminPreHandler = requireAdmin as (
  req: FastifyRequest,
  reply: FastifyReply
) => void;

/** Einen async PreHandler für die Option preHandler typ-kompatibel machen. */
export function preHandlerWrap(
  fn: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
): (req: FastifyRequest, reply: FastifyReply) => void {
  return fn as (req: FastifyRequest, reply: FastifyReply) => void;
}
