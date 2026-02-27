import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../auth/middleware.js';

const companiesRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/companies', { preHandler: requireAuth }, async (request, reply) => {
    const companies = await request.server.prisma.company.findMany({
      include: { departments: true },
    });
    return reply.send(companies);
  });
};

export { companiesRoutes };
