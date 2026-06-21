import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError, treeifyError } from 'zod';
import fastifyCookie from '@fastify/cookie';
import { prisma } from './infrastructure/db/prisma.js';
import { initStorage } from './infrastructure/storage/index.js';
import { authRoutes } from './domains/auth/routes/index.js';
import {
  organisationRoutes,
  contextRoutes,
  assignmentsRoutes,
  scopePeopleRoutes,
} from './domains/organisation/routes/index.js';
import { documentsRoutes } from './domains/documents/routes/index.js';
import { meRoutes } from './domains/me/routes/index.js';
import { pinnedRoutes } from './domains/pinned/routes/index.js';
import adminRoutes from './domains/admin/routes/index.js';
import { searchRoutes } from './domains/search/routes/index.js';
import { maintenanceModePreHandler } from './infrastructure/maintenance/maintenancePreHandler.js';
import { maintenanceRoutes } from './infrastructure/maintenance/maintenanceRoutes.js';
import { shouldDisableHttpRequestLogging } from './infrastructure/logging/httpRequestLogging.js';
import { appVersion } from './infrastructure/appVersion.js';
import { backendPackageName } from './infrastructure/packageInfo.js';
import { systemRoutes } from './domains/system/routes/index.js';
import { isLiveEventsEnabled } from './infrastructure/liveEvents/liveEventConfig.js';
import { getLiveEventRegistryStats } from './infrastructure/liveEvents/liveEventRegistry.js';
import { stopLiveEventListener } from './infrastructure/liveEvents/liveEventListener.js';

function buildLoggerConfig(): {
  level: string;
  transport?: { target: string; options: Record<string, unknown> };
} {
  const config: {
    level: string;
    transport?: { target: string; options: Record<string, unknown> };
  } = {
    level: process.env.LOG_LEVEL ?? 'info',
  };
  if (process.env.NODE_ENV !== 'production') {
    try {
      require.resolve('pino-pretty');
      config.transport = { target: 'pino-pretty', options: { translateTime: 'SYS:standard' } };
    } catch {
      // pino-pretty nicht installiert, ohne Transport (JSON)
    }
  }
  return config;
}

/**
 * Erstellt und konfiguriert die Fastify-App (Routen, Cookie, Prisma).
 * Für Server-Start in index.ts und für Tests (app.inject()).
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: buildLoggerConfig(),
    disableRequestLogging: shouldDisableHttpRequestLogging,
  });
  await app.register(fastifyCookie, { secret: process.env.SESSION_SECRET });
  app.decorate('prisma', prisma);
  const storage = await initStorage();
  app.decorate('storage', storage ?? null);
  app.addHook('onRequest', maintenanceModePreHandler);
  app.addHook('onClose', async (instance) => {
    await stopLiveEventListener(instance.log);
    await instance.prisma.$disconnect();
  });

  app.setErrorHandler(
    (
      err: Error & {
        statusCode?: number;
        code?: string;
        issues?: unknown[];
      },
      request,
      reply
    ) => {
      if (reply.sent) return;

      // Zod (instanz oder Duck-Typing: name/issues)
      if (err instanceof ZodError) {
        return reply.status(400).send({ error: 'Invalid input', details: treeifyError(err) });
      }
      if (err.name === 'ZodError' || Array.isArray(err.issues)) {
        const maybe = err as unknown as ZodError;
        const details = Array.isArray(maybe.issues) ? treeifyError(maybe) : undefined;
        return reply.status(400).send({ error: 'Invalid input', details });
      }

      // Prisma P2025 (Record not found)
      if (err.code === 'P2025') {
        return reply.status(404).send({ error: 'Ressource nicht gefunden' });
      }

      // Prisma P2003 (Foreign key constraint failed – Restrict)
      if (err.code === 'P2003') {
        return reply.status(409).send({
          error: 'Resource cannot be deleted because dependencies exist.',
          code: 'P2003',
        });
      }

      // Postgres/Netzwerk kurz nicht erreichbar (z. B. Container-Neustart)
      if (err.code === 'ECONNREFUSED') {
        return reply.status(503).send({
          error:
            'Datenbank vorübergehend nicht erreichbar. Bitte kurz warten und erneut versuchen.',
          code: 'DATABASE_UNAVAILABLE',
        });
      }

      // Prisma: Verbindung zum Server fehlt (z. B. DB startet noch während `make test`)
      if (err.code === 'P1001') {
        return reply.status(503).send({
          error:
            'Datenbank vorübergehend nicht erreichbar. Bitte kurz warten und erneut versuchen.',
          code: 'DATABASE_UNAVAILABLE',
        });
      }

      // Fastify/HTTP mit statusCode
      if (err.statusCode != null && err.statusCode >= 400) {
        return reply.status(err.statusCode).send({
          error: err.message || 'Fehler',
          ...(err.code != null && { code: err.code }),
        });
      }

      // Unbekannt → 500
      request.log.error(err);
      const showErrorDetail =
        process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';
      const message = showErrorDetail
        ? err.message || 'Interner Serverfehler'
        : 'Interner Serverfehler';
      return reply.status(500).send({ error: message });
    }
  );

  app.get('/', () => ({
    name: backendPackageName,
    version: appVersion,
    _links: { health: '/health', ready: '/ready' },
  }));
  app.get('/health', () => ({ status: 'ok' }));
  app.get('/ready', async (request, reply) => {
    try {
      await request.server.prisma.$queryRaw`SELECT 1`;
      const body: {
        status: string;
        liveEvents?: { enabled: boolean; connections: number; uniqueUsers: number };
      } = { status: 'ok' };
      if (isLiveEventsEnabled()) {
        const stats = getLiveEventRegistryStats();
        body.liveEvents = {
          enabled: true,
          connections: stats.connections,
          uniqueUsers: stats.uniqueUsers,
        };
      }
      return reply.send(body);
    } catch (err) {
      request.log.error(err);
      return reply.status(503).send({
        status: 'error',
        message: 'Database unreachable',
      });
    }
  });

  app.register(authRoutes, { prefix: '/api/v1' });
  app.register(organisationRoutes, { prefix: '/api/v1' });
  app.register(contextRoutes, { prefix: '/api/v1' });
  app.register(documentsRoutes, { prefix: '/api/v1' });
  app.register(assignmentsRoutes, { prefix: '/api/v1' });
  app.register(scopePeopleRoutes, { prefix: '/api/v1' });
  app.register(meRoutes, { prefix: '/api/v1' });
  app.register(pinnedRoutes, { prefix: '/api/v1' });
  app.register(searchRoutes, { prefix: '/api/v1' });
  app.register(maintenanceRoutes, { prefix: '/api/v1' });
  app.register(systemRoutes, { prefix: '/api/v1' });
  app.register(adminRoutes, { prefix: '/api/v1' });
  return app;
}
