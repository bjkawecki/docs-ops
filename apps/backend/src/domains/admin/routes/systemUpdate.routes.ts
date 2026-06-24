import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAuthPreHandler, requireAdminPreHandler } from '../../auth/middleware.js';
import {
  adminSystemCheckUpdatesResponseSchema,
  adminSystemSettingsSchema,
  adminSystemUpdateStatusSchema,
  patchAdminSystemSettingsBodySchema,
} from '../schemas/systemUpdate.js';
import { getSystemSettings, updateSystemSettings } from '../services/adminSystemSettingsService.js';
import {
  checkAdminSystemUpdatesAndNotify,
  getAdminSystemUpdateStatus,
  resetAdminSystemUpdateCacheForTests,
} from '../services/adminSystemUpdateService.js';

const adminSystemUpdateRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  const preAdmin = [requireAuthPreHandler, requireAdminPreHandler];

  app.get('/admin/system/update-status', { preHandler: preAdmin }, async (request, reply) => {
    const status = await getAdminSystemUpdateStatus(request.server.prisma);
    return reply.send(adminSystemUpdateStatusSchema.parse(status));
  });

  app.post('/admin/system/check-updates', { preHandler: preAdmin }, async (request, reply) => {
    const result = await checkAdminSystemUpdatesAndNotify(request.server.prisma);
    return reply.send(adminSystemCheckUpdatesResponseSchema.parse(result));
  });

  app.get('/admin/system/settings', { preHandler: preAdmin }, async (request, reply) => {
    const settings = await getSystemSettings(request.server.prisma);
    return reply.send(
      adminSystemSettingsSchema.parse({
        updateCheckEnabled: settings.updateCheckEnabled,
        updatedAt: settings.updatedAt.toISOString(),
      })
    );
  });

  app.patch('/admin/system/settings', { preHandler: preAdmin }, async (request, reply) => {
    const body = patchAdminSystemSettingsBodySchema.parse(request.body);
    const settings = await updateSystemSettings(request.server.prisma, body);
    resetAdminSystemUpdateCacheForTests();
    return reply.send(
      adminSystemSettingsSchema.parse({
        updateCheckEnabled: settings.updateCheckEnabled,
        updatedAt: settings.updatedAt.toISOString(),
      })
    );
  });

  return Promise.resolve();
};

export default adminSystemUpdateRoutes;
