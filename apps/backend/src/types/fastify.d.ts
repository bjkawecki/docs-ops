import type { PrismaClient } from '../../generated/prisma/client.js';
import type { RequestUser } from '../auth/types.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
  interface FastifyRequest {
    user?: RequestUser;
  }
}
