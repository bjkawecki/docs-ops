import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerCatalogRoutes } from './catalog.routes.js';
import { registerContentRoutes } from './content.routes.js';
import { registerPublicationRoutes } from './publication.routes.js';
import { registerCollaborationRoutes } from './collaboration.routes.js';
import { registerGrantsTagsRoutes } from './grants-tags.routes.js';

const documentsRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  // Allow binary uploads for attachment route (body as Buffer).
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) =>
    done(null, body as Buffer)
  );
  app.addContentTypeParser(/^image\//, { parseAs: 'buffer' }, (_req, body, done) =>
    done(null, body as Buffer)
  );
  app.addContentTypeParser('application/pdf', { parseAs: 'buffer' }, (_req, body, done) =>
    done(null, body as Buffer)
  );

  registerCatalogRoutes(app);
  registerContentRoutes(app);
  registerPublicationRoutes(app);
  registerCollaborationRoutes(app);
  registerGrantsTagsRoutes(app);
  return Promise.resolve();
};

export { documentsRoutes };
