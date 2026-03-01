import { createRequire } from 'node:module';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { prisma } from './db.js';
import { authRoutes } from './auth/routes.js';
import { organisationRoutes } from './routes/organisation.js';
import { contextRoutes } from './routes/contexts.js';
import { documentsRoutes } from './routes/documents.js';
import assignmentsRoutes from './routes/assignments.js';
import meRoutes from './routes/me.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { name: string; version: string };

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
  const app = Fastify({ logger: buildLoggerConfig() });
  await app.register(fastifyCookie, { secret: process.env.SESSION_SECRET });
  app.decorate('prisma', prisma);
  app.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect();
  });

  app.setErrorHandler(
    (
      err: Error & {
        statusCode?: number;
        code?: string;
        issues?: unknown[];
        flatten?: () => { fieldErrors: unknown };
      },
      request,
      reply
    ) => {
      if (reply.sent) return;

      // Zod (Duck-Typing: name oder issues)
      if (err.name === 'ZodError' || Array.isArray(err.issues)) {
        const details = typeof err.flatten === 'function' ? err.flatten().fieldErrors : undefined;
        return reply.status(400).send({ error: 'Ungültige Eingabe', details });
      }

      // Prisma P2025 (Record not found)
      if (err.code === 'P2025') {
        return reply.status(404).send({ error: 'Ressource nicht gefunden' });
      }

      // Prisma P2003 (Foreign key constraint failed – Restrict)
      if (err.code === 'P2003') {
        return reply.status(409).send({
          error: 'Ressource kann nicht gelöscht werden, da Abhängigkeiten existieren.',
          code: 'P2003',
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
      return reply.status(500).send({ error: 'Interner Serverfehler' });
    }
  );

  app.get('/', async () => ({
    name: pkg.name,
    version: pkg.version,
    _links: { health: '/health', ready: '/ready' },
  }));
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (request, reply) => {
    try {
      await request.server.prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: 'ok' });
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
  app.register(meRoutes, { prefix: '/api/v1' });
  return app;
}
