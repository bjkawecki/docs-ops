import { createRequire } from 'node:module';
import Fastify from 'fastify';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { name: string; version: string };

const app = Fastify({ logger: true });

app.get('/', async () => ({
  name: pkg.name,
  version: pkg.version,
  _links: { health: '/health' },
}));

app.get('/health', async () => ({ status: 'ok' }));

const port = Number(process.env.PORT) || 8080;
// 0.0.0.0 = alle Interfaces (Docker/LAN); für nur localhost: HOST=127.0.0.1 setzen
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
