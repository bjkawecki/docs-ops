import type { FastifyReply, FastifyRequest } from 'fastify';
import { attachmentIdParamSchema } from '../schemas/documents.js';

export async function requireStorageAndDocumentAttachment(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<{
  storage: NonNullable<FastifyRequest['server']['storage']>;
  prisma: FastifyRequest['server']['prisma'];
  documentId: string;
  attachmentId: string;
  attachment: { id: string; documentId: string; objectKey: string };
} | null> {
  const storage = request.server.storage;
  if (!storage) {
    void reply.status(503).send({ error: 'Storage not available' });
    return null;
  }
  const prisma = request.server.prisma;
  const { documentId, attachmentId } = attachmentIdParamSchema.parse(request.params);
  const attachment = await prisma.documentAttachment.findFirst({
    where: { id: attachmentId, documentId },
    select: { id: true, documentId: true, objectKey: true },
  });
  if (!attachment) {
    void reply.status(404).send({ error: 'Attachment not found' });
    return null;
  }
  return { storage, prisma, documentId, attachmentId, attachment };
}
