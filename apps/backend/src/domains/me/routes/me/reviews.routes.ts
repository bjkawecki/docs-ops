import type { FastifyInstance } from 'fastify';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../../auth/middleware.js';
import { meReviewsQuerySchema } from '../../schemas/me.js';
import { listMeReviews } from '../../services/meReviewsService.js';

function registerMeReviewsRoutes(app: FastifyInstance): void {
  app.get('/me/reviews', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = meReviewsQuerySchema.parse(request.query);
    const result = await listMeReviews(prisma, userId, query);
    return reply.send(result);
  });
}

export { registerMeReviewsRoutes };
