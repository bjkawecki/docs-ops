import { createRequire } from 'node:module';
import Fastify from 'fastify';
import { prisma } from './db.js';
import { companiesRoutes } from './routes/companies.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { name: string; version: string };

const app = Fastify({ logger: true });

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

app.register(companiesRoutes, { prefix: '/api/v1' });

const port = Number(process.env.PORT) || 8080;
// 0.0.0.0 = alle Interfaces (Docker/LAN); für nur localhost: HOST=127.0.0.1 setzen
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
