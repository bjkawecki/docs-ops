import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../auth/middleware.js';
import { searchDocumentsQuerySchema } from './schemas/search.js';
import {
  searchDocumentsByContainsFallback,
  searchDocumentsForUser,
} from '../services/search/documentSearchService.js';

const searchRoutes: FastifyPluginAsync = (app: FastifyInstance): Promise<void> => {
  app.get('/search/documents', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = searchDocumentsQuerySchema.parse(request.query);

    const searchArgs = {
      query: query.q.trim(),
      limit: query.limit,
      offset: query.offset,
      contextType: query.contextType,
      companyId: query.companyId,
      departmentId: query.departmentId,
      teamId: query.teamId,
    };

    try {
      const result = await searchDocumentsForUser(request.server.prisma, userId, searchArgs);
      return reply.send(result);
    } catch (error) {
      request.log.warn(
        { error },
        'GET /search/documents: index query failed, using contains fallback (same as catalog)'
      );
      const result = await searchDocumentsByContainsFallback(
        request.server.prisma,
        userId,
        searchArgs
      );
      return reply.send(result);
    }
  });
  return Promise.resolve();
};

export default searchRoutes;
