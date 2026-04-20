import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../auth/middleware.js';
import { searchDocumentsQuerySchema } from './schemas/search.js';
import { searchDocumentsForUser } from '../services/documentSearchService.js';

const searchRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  app.get('/search/documents', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = searchDocumentsQuerySchema.parse(request.query);

    const result = await searchDocumentsForUser(request.server.prisma, userId, {
      query: query.q.trim(),
      limit: query.limit,
      offset: query.offset,
      contextType: query.contextType,
      companyId: query.companyId,
      departmentId: query.departmentId,
      teamId: query.teamId,
    });

    return reply.send(result);
  });
};

export default searchRoutes;
