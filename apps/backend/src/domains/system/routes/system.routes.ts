import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAuthPreHandler } from '../../auth/middleware.js';
import { appVersion } from '../../../infrastructure/appVersion.js';
import { semverParamSchema } from '../schemas/releases.js';
import { getRelease, listReleases, ReleaseNotFoundError } from '../services/releaseNotesService.js';

const systemRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  app.get('/system/version', async (_request, reply) => {
    return reply.send({ version: appVersion });
  });

  app.get('/releases', { preHandler: requireAuthPreHandler }, async (_request, reply) => {
    return reply.send({ releases: listReleases() });
  });

  app.get('/releases/:version', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const version = semverParamSchema.parse((request.params as { version: string }).version);
    try {
      return reply.send(getRelease(version));
    } catch (err) {
      if (err instanceof ReleaseNotFoundError) {
        return reply.status(404).send({ error: err.message });
      }
      throw err;
    }
  });

  return Promise.resolve();
};

export { systemRoutes };
