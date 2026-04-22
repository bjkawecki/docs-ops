import type { FastifyInstance } from 'fastify';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../../auth/middleware.js';
import type { RequestUser } from '../../../auth/types.js';
import { patchPreferencesBodySchema } from '../../schemas/me.js';
import type { UserPreferences } from './route-types.js';
import { userPreferencesFromJson } from './route-helpers.js';

function registerMePreferencesRoutes(app: FastifyInstance): void {
  app.get('/me/preferences', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = getEffectiveUserId(request as RequestWithUser);
    const user = await request.server.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferences: true },
    });
    return reply.send(userPreferencesFromJson(user.preferences));
  });

  app.patch('/me/preferences', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const body = patchPreferencesBodySchema.parse(request.body);

    const current = await request.server.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferences: true },
    });
    const currentPrefs = userPreferencesFromJson(current.preferences);
    let recentItemsByScope = currentPrefs.recentItemsByScope ?? {};
    if (body.recentItemsByScope !== undefined) {
      recentItemsByScope = { ...recentItemsByScope };
      for (const [scopeKey, list] of Object.entries(body.recentItemsByScope)) {
        const seen = new Set<string>();
        const deduped = list
          .filter((item) => {
            const key = `${item.type}:${item.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 8);
        recentItemsByScope[scopeKey] = deduped;
      }
    }
    const merged: UserPreferences = {
      ...currentPrefs,
      ...(body.theme !== undefined && { theme: body.theme }),
      ...(body.sidebarPinned !== undefined && { sidebarPinned: body.sidebarPinned }),
      ...(body.scopeRecentPanelOpen !== undefined && {
        scopeRecentPanelOpen: body.scopeRecentPanelOpen,
      }),
      ...(body.locale !== undefined && { locale: body.locale }),
      ...(body.primaryColor !== undefined && { primaryColor: body.primaryColor }),
      ...(body.textSize !== undefined && { textSize: body.textSize }),
      ...(body.recentItemsByScope !== undefined && { recentItemsByScope }),
      ...(body.notificationSettings !== undefined && {
        notificationSettings: {
          inApp: {
            ...currentPrefs.notificationSettings?.inApp,
            ...body.notificationSettings.inApp,
          },
          email: {
            ...currentPrefs.notificationSettings?.email,
            ...body.notificationSettings.email,
          },
        },
      }),
    };

    await request.server.prisma.user.update({
      where: { id: userId },
      data: { preferences: merged as object },
    });
    return reply.send(merged);
  });
}

export { registerMePreferencesRoutes };
