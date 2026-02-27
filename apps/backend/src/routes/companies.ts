import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const companiesRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/companies', async (request, reply) => {
    const companies = await request.server.prisma.company.findMany({
      include: { departments: true },
    });
    return reply.send(companies);
  });
};

export { companiesRoutes };
