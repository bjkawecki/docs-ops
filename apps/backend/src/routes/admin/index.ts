import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import impersonationRoutes from './impersonation.routes.js';
import usersRoutes from './users.routes.js';
import organisationRoutes from './organisation.routes.js';
import jobsRoutes from './jobs.routes.js';

const adminRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  app.register(jobsRoutes);
  app.register(impersonationRoutes);
  app.register(usersRoutes);
  app.register(organisationRoutes);
  return Promise.resolve();
};

export default adminRoutes;
