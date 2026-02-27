import { createRequire } from 'node:module';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { prisma } from './db.js';
import { companiesRoutes } from './routes/companies.js';
import { authRoutes } from './auth/routes.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { name: string; version: string };

/**
 * Erstellt und konfiguriert die Fastify-App (Routen, Cookie, Prisma).
 * Für Server-Start in index.ts und für Tests (app.inject()).
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(fastifyCookie, { secret: process.env.SESSION_SECRET });
  app.decorate('prisma', prisma);
  app.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect();
  });

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
  app.register(companiesRoutes, { prefix: '/api/v1' });
  return app;
}
