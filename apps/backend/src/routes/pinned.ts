import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../auth/middleware.js';
import { canPinForScope, getVisiblePinnedScopeIds, canRead } from '../permissions/index.js';
import {
  listPinnedQuerySchema,
  createPinnedBodySchema,
  pinnedIdParamSchema,
} from './schemas/pinned.js';
import { PinnedScopeType } from '../../generated/prisma/client.js';

const pinnedRoutes: FastifyPluginAsync = (app: FastifyInstance): void => {
  /** GET /api/v1/pinned – alle für den User sichtbaren Pins (nur Dokumente, deletedAt null). */
  app.get('/pinned', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = listPinnedQuerySchema.safeParse(request.query);
    const q = query.success ? query.data : {};

    const { teamIds, departmentIds, companyIds } = await getVisiblePinnedScopeIds(prisma, userId);

    const scopeConditions: { scopeType: PinnedScopeType; scopeId: string }[] = [];
    if (q.scopeType && q.scopeId) {
      scopeConditions.push({ scopeType: q.scopeType as PinnedScopeType, scopeId: q.scopeId });
    } else {
      teamIds.forEach((id) =>
        scopeConditions.push({ scopeType: PinnedScopeType.team, scopeId: id })
      );
      departmentIds.forEach((id) =>
        scopeConditions.push({ scopeType: PinnedScopeType.department, scopeId: id })
      );
      companyIds.forEach((id) =>
        scopeConditions.push({ scopeType: PinnedScopeType.company, scopeId: id })
      );
    }

    if (scopeConditions.length === 0) {
      return reply.send({ items: [] });
    }

    const pins = await prisma.documentPinnedInScope.findMany({
      where: {
        OR: scopeConditions.map((s) => ({ scopeType: s.scopeType, scopeId: s.scopeId })),
        document: { deletedAt: null },
      },
      include: {
        document: { select: { id: true, title: true } },
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    const items = await Promise.all(
      pins.map(async (pin) => {
        const canUnpin = await canPinForScope(prisma, userId, pin.scopeType, pin.scopeId);
        return {
          id: pin.id,
          scopeType: pin.scopeType,
          scopeId: pin.scopeId,
          documentId: pin.document.id,
          documentTitle: pin.document.title,
          documentHref: `/documents/${pin.document.id}`,
          order: pin.order,
          pinnedAt: pin.createdAt.toISOString(),
          canUnpin,
        };
      })
    );

    return reply.send({ items });
  });

  /** POST /api/v1/pinned – Dokument in Scope anpinnen. Idempotent bei Duplikat. */
  app.post('/pinned', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const body = createPinnedBodySchema.parse(request.body);

    const canPin = await canPinForScope(prisma, userId, body.scopeType, body.scopeId);
    if (!canPin) {
      return reply.status(403).send({ error: 'Permission denied to pin in this scope' });
    }

    const canReadDoc = await canRead(prisma, userId, body.documentId);
    if (!canReadDoc) {
      return reply.status(403).send({ error: 'Permission denied to read this document' });
    }

    const doc = await prisma.document.findUnique({
      where: { id: body.documentId, deletedAt: null },
      select: { id: true },
    });
    if (!doc) {
      return reply.status(404).send({ error: 'Document not found or deleted' });
    }

    const existing = await prisma.documentPinnedInScope.findUnique({
      where: {
        scopeType_scopeId_documentId: {
          scopeType: body.scopeType as PinnedScopeType,
          scopeId: body.scopeId,
          documentId: body.documentId,
        },
      },
    });
    if (existing) {
      return reply.status(200).send({
        id: existing.id,
        scopeType: existing.scopeType,
        scopeId: existing.scopeId,
        documentId: existing.documentId,
        order: existing.order,
        pinnedAt: existing.createdAt.toISOString(),
      });
    }

    const created = await prisma.documentPinnedInScope.create({
      data: {
        documentId: body.documentId,
        scopeType: body.scopeType as PinnedScopeType,
        scopeId: body.scopeId,
        order: body.order ?? 0,
        pinnedById: userId,
      },
    });

    return reply.status(201).send({
      id: created.id,
      scopeType: created.scopeType,
      scopeId: created.scopeId,
      documentId: created.documentId,
      order: created.order,
      pinnedAt: created.createdAt.toISOString(),
    });
  });

  /** DELETE /api/v1/pinned/:id – Pin entfernen. */
  app.delete('/pinned/:id', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const { id } = pinnedIdParamSchema.parse(request.params);

    const pin = await prisma.documentPinnedInScope.findUnique({
      where: { id },
      select: { id: true, scopeType: true, scopeId: true },
    });
    if (!pin) {
      return reply.status(404).send({ error: 'Pinned item not found' });
    }

    const canUnpin = await canPinForScope(prisma, userId, pin.scopeType, pin.scopeId);
    if (!canUnpin) {
      return reply.status(403).send({ error: 'Permission denied to unpin in this scope' });
    }

    await prisma.documentPinnedInScope.delete({ where: { id } });
    return reply.status(204).send();
  });
};

export default pinnedRoutes;
