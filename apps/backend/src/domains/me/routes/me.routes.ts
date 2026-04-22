import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerMeAccountSessionRoutes } from './me/account-sessions.routes.js';
import { registerMeDocumentsRoutes } from './me/documents.routes.js';
import { registerMeNotificationRoutes } from './me/notifications.routes.js';
import { registerMePreferencesRoutes } from './me/preferences.routes.js';
import { registerMeProfileRoutes } from './me/profile.routes.js';
import { registerMeStorageRoutes } from './me/storage.routes.js';
import { registerMeTrashArchiveRoutes } from './me/trash-archive.routes.js';

export type { MeTrashArchiveItem } from '../schemas/me.js';

const meRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  registerMeProfileRoutes(app);
  registerMePreferencesRoutes(app);
  registerMeDocumentsRoutes(app);
  registerMeTrashArchiveRoutes(app);
  registerMeStorageRoutes(app);
  registerMeNotificationRoutes(app);
  registerMeAccountSessionRoutes(app);
  return Promise.resolve();
};

export default meRoutes;
