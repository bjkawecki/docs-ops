import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../auth/middleware.js';
import { requireDocumentAccess } from '../permissions/index.js';

const documentsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get<{
    Params: { documentId: string };
  }>(
    '/documents/:documentId',
    {
      preHandler: [requireAuth, requireDocumentAccess('read')],
    },
    async (request, reply) => {
      const { documentId } = request.params;
      const doc = await request.server.prisma.document.findUnique({
        where: { id: documentId },
        select: {
          id: true,
          title: true,
          content: true,
          pdfUrl: true,
          contextId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!doc) return reply.status(404).send({ error: 'Dokument nicht gefunden' });
      return reply.send(doc);
    }
  );
};

export { documentsRoutes };
