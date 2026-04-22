import type { FastifyInstance } from 'fastify';
import {
  requireAuthPreHandler,
  preHandlerWrap,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../auth/middleware.js';
import { requireDocumentAccess } from '../permissions/index.js';
import {
  canReadScopeForOwner,
  canCreateTagForOwner,
  getContextOwnerId,
} from '../../organisation/permissions/contextPermissions.js';
import { getReadableCatalogOwnerIds } from '../../organisation/permissions/catalogPermissions.js';
import {
  getDocumentGrants,
  listCandidateUsersForDocumentGrants,
  replaceDocumentDepartmentGrants,
  replaceDocumentTeamGrants,
  replaceDocumentUserGrants,
  UnsupportedScopeWriteGrantError,
} from '../services/collaboration/documentGrantsService.js';
import {
  documentIdParamSchema,
  putGrantsUsersBodySchema,
  putGrantsTeamsBodySchema,
  putGrantsDepartmentsBodySchema,
  tagIdParamSchema,
  createTagBodySchema,
  getTagsQuerySchema,
} from '../schemas/documents.js';
import { excludeUserIds } from '../../notifications/services/notificationRecipients.js';
import { enqueueNotificationEvent } from '../services/route-support/documentRouteSupport.js';

export const registerGrantsTagsRoutes = (app: FastifyInstance): void => {
  /** GET Grants (User, Team, Department) – requireDocumentAccess('read'). */
  app.get(
    '/documents/:documentId/grants',
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))] },
    async (request, reply) => {
      const { documentId } = documentIdParamSchema.parse(request.params);
      const result = await getDocumentGrants(request.server.prisma, documentId);
      return reply.send(result);
    }
  );

  /** GET Kandidaten für nutzerbasiertes Write-Granting (Scope-User ohne implizite Writer). */
  app.get(
    '/documents/:documentId/grants/candidate-users',
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('read'))] },
    async (request, reply) => {
      const { documentId } = documentIdParamSchema.parse(request.params);
      const result = await listCandidateUsersForDocumentGrants(request.server.prisma, documentId);
      if (!result) return reply.status(404).send({ error: 'Document not found' });
      return reply.send(result);
    }
  );

  /** PUT User-Grants ersetzen – requireDocumentAccess('write'). */
  app.put(
    '/documents/:documentId/grants/users',
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const actorUserId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const { grants } = putGrantsUsersBodySchema.parse(request.body);
      const result = await replaceDocumentUserGrants(prisma, { documentId, grants });
      try {
        const targets = excludeUserIds(result.changedUserIds, actorUserId);
        if (targets.length > 0) {
          await enqueueNotificationEvent({
            eventType: 'document-grants-changed',
            targetUserIds: targets,
            payload: { documentId, changedByUserId: actorUserId },
          });
        }
      } catch (error) {
        request.log.warn(
          { error, documentId },
          'Failed to enqueue notification job after user grants update'
        );
      }
      return reply.send({ grants: result.grants });
    }
  );

  /** PUT Team-Grants ersetzen – requireDocumentAccess('write'). */
  app.put(
    '/documents/:documentId/grants/teams',
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const actorUserId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const { grants } = putGrantsTeamsBodySchema.parse(request.body);
      let result: Awaited<ReturnType<typeof replaceDocumentTeamGrants>>;
      try {
        result = await replaceDocumentTeamGrants(prisma, { documentId, grants });
      } catch (error) {
        if (error instanceof UnsupportedScopeWriteGrantError) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
      try {
        const targets = excludeUserIds(result.changedUserIds, actorUserId);
        if (targets.length > 0) {
          await enqueueNotificationEvent({
            eventType: 'document-grants-changed',
            targetUserIds: targets,
            payload: { documentId, changedByUserId: actorUserId },
          });
        }
      } catch (error) {
        request.log.warn(
          { error, documentId },
          'Failed to enqueue notification job after team grants update'
        );
      }
      return reply.send({ grants: result.grants });
    }
  );

  /** PUT Department-Grants ersetzen – requireDocumentAccess('write'). */
  app.put(
    '/documents/:documentId/grants/departments',
    { preHandler: [requireAuthPreHandler, preHandlerWrap(requireDocumentAccess('write'))] },
    async (request, reply) => {
      const prisma = request.server.prisma;
      const actorUserId = getEffectiveUserId(request as RequestWithUser);
      const { documentId } = documentIdParamSchema.parse(request.params);
      const { grants } = putGrantsDepartmentsBodySchema.parse(request.body);
      let result: Awaited<ReturnType<typeof replaceDocumentDepartmentGrants>>;
      try {
        result = await replaceDocumentDepartmentGrants(prisma, { documentId, grants });
      } catch (error) {
        if (error instanceof UnsupportedScopeWriteGrantError) {
          return reply.status(400).send({ error: error.message });
        }
        throw error;
      }
      try {
        const targets = excludeUserIds(result.changedUserIds, actorUserId);
        if (targets.length > 0) {
          await enqueueNotificationEvent({
            eventType: 'document-grants-changed',
            targetUserIds: targets,
            payload: { documentId, changedByUserId: actorUserId },
          });
        }
      } catch (error) {
        request.log.warn(
          { error, documentId },
          'Failed to enqueue notification job after department grants update'
        );
      }
      return reply.send({ grants: result.grants });
    }
  );

  /** GET Tags for catalog filter – all tags from scopes the user can read in the catalog. */
  app.get('/tags/catalog', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const ownerIds = await getReadableCatalogOwnerIds(prisma, userId);
    if (ownerIds.length === 0) return reply.send([]);
    const tags = await prisma.tag.findMany({
      where: { ownerId: { in: ownerIds } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return reply.send(tags);
  });

  /** GET Tags (scope-aware) – ownerId oder contextId erforderlich, canReadScopeForOwner. */
  app.get('/tags', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const query = getTagsQuerySchema.parse(request.query);
    let ownerId: string | null = query.ownerId ?? null;
    if (!ownerId && query.contextId) {
      ownerId = await getContextOwnerId(prisma, query.contextId);
    }
    if (!ownerId) {
      return reply.status(400).send({
        error: 'ownerId or contextId is required',
      });
    }
    const canRead = await canReadScopeForOwner(prisma, userId, ownerId);
    if (!canRead) return reply.status(403).send({ error: 'No access to this scope' });
    const tags = await prisma.tag.findMany({
      where: { ownerId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return reply.send(tags);
  });

  /** POST Tag anlegen – ownerId oder contextId im Body, canCreateTagForOwner. Bei doppeltem Namen im Scope 409. */
  app.post('/tags', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const body = createTagBodySchema.parse(request.body);
    let ownerId: string | null | undefined = body.ownerId;
    if (ownerId == null && body.contextId != null) {
      ownerId = await getContextOwnerId(prisma, body.contextId);
      if (ownerId == null) return reply.status(400).send({ error: 'Context has no owner' });
    }
    if (ownerId == null)
      return reply.status(400).send({ error: 'ownerId or contextId is required' });
    const canCreate = await canCreateTagForOwner(prisma, userId, ownerId);
    if (!canCreate) {
      return reply.status(403).send({ error: 'No permission to create tags in this scope' });
    }

    const existing = await prisma.tag.findUnique({
      where: { ownerId_name: { ownerId, name: body.name } },
      select: { id: true },
    });
    if (existing) {
      return reply.status(409).send({
        error: 'Tag mit diesem Namen existiert bereits in diesem Scope.',
      });
    }

    const tag = await prisma.tag.create({
      data: { name: body.name, ownerId },
      select: { id: true, name: true },
    });
    return reply.status(201).send(tag);
  });

  /** DELETE Tag – canCreateTagForOwner(tag.ownerId). DocumentTag wird per Cascade entfernt. */
  app.delete('/tags/:tagId', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const prisma = request.server.prisma;
    const userId = getEffectiveUserId(request as RequestWithUser);
    const { tagId } = tagIdParamSchema.parse(request.params);
    const tag = await prisma.tag.findUnique({
      where: { id: tagId },
      select: { ownerId: true },
    });
    if (!tag) return reply.status(404).send({ error: 'Tag not found' });
    const canDelete = await canCreateTagForOwner(prisma, userId, tag.ownerId);
    if (!canDelete) return reply.status(403).send({ error: 'No permission to delete this tag' });
    await prisma.tag.delete({ where: { id: tagId } });
    return reply.status(204).send();
  });
};
