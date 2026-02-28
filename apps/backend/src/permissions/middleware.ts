import type { FastifyRequest, FastifyReply } from 'fastify';
import { canRead } from './canRead.js';
import { canWrite } from './canWrite.js';
import { DOCUMENT_FOR_PERMISSION_INCLUDE } from './documentLoad.js';

export const DOCUMENT_ID_PARAM = 'documentId';

/**
 * PreHandler: Prüft Lese- oder Schreibzugriff auf ein Dokument.
 * Muss nach requireAuth laufen. Liest documentId aus request.params.documentId.
 * 400 wenn documentId fehlt, 401 wenn kein User, 404 wenn Dokument nicht existiert, 403 wenn kein Zugriff.
 */
export function requireDocumentAccess(
  mode: 'read' | 'write'
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const documentId = (request.params as Record<string, string | undefined>)?.[DOCUMENT_ID_PARAM];
    if (typeof documentId !== 'string' || documentId.trim() === '') {
      return reply.status(400).send({
        error: 'documentId fehlt oder ist leer',
      });
    }
    if (!request.user) {
      return reply.status(401).send({ error: 'Nicht angemeldet' });
    }
    const prisma = request.server.prisma;
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: DOCUMENT_FOR_PERMISSION_INCLUDE,
    });
    if (!doc) {
      return reply.status(404).send({ error: 'Dokument nicht gefunden' });
    }
    if (mode === 'read' && doc.deletedAt != null) {
      return reply.status(404).send({ error: 'Dokument nicht gefunden' });
    }
    const allowed =
      mode === 'read'
        ? await canRead(prisma, request.user.id, doc)
        : await canWrite(prisma, request.user.id, doc);
    if (!allowed) {
      return reply.status(403).send({ error: 'Kein Zugriff auf dieses Dokument' });
    }
  };
}
