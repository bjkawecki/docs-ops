import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../auth/middleware.js';
import { SESSION_COOKIE_NAME } from '../auth/middleware.js';
import type { RequestUser } from '../auth/types.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  patchMeBodySchema,
  patchPreferencesBodySchema,
  patchAccountBodySchema,
  sessionIdParamSchema,
} from './schemas/me.js';

/** User-Preferences: theme, sidebarPinned, locale. Defaults in App, nicht in DB. */
export type UserPreferences = {
  theme?: 'light' | 'dark' | 'auto';
  sidebarPinned?: boolean;
  locale?: 'en' | 'de';
};

/** Ein Team-Eintrag in der Identity (mit Rolle). */
export type MeIdentityTeam = {
  teamId: string;
  teamName: string;
  departmentName: string;
  departmentId: string;
  role: 'member' | 'leader';
};

/** Response GET /me. */
export type MeResponse = {
  user: {
    id: string;
    name: string;
    email: string | null;
    isAdmin: boolean;
    hasLocalLogin: boolean;
  };
  identity: {
    teams: MeIdentityTeam[];
    departments: { id: string; name: string }[];
    supervisorOfDepartments: { id: string; name: string }[];
    userSpaces: { id: string; name: string }[];
  };
  preferences: UserPreferences;
};

const meRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /** GET /api/v1/me – erweiterte Nutzerdaten inkl. Identity und Preferences. */
  app.get('/me', { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;

    const user = await request.server.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        isAdmin: true,
        passwordHash: true,
        preferences: true,
        teamMemberships: {
          include: {
            team: { include: { department: true } },
          },
        },
        leaderOfTeams: {
          include: {
            team: { include: { department: true } },
          },
        },
        supervisorOfDepartments: {
          include: { department: true },
        },
        userSpaces: { select: { id: true, name: true } },
      },
    });

    const leaderTeamIds = new Set(user.leaderOfTeams.map((l) => l.teamId));
    const teams: MeIdentityTeam[] = [];
    const departmentMap = new Map<string, { id: string; name: string }>();

    for (const m of user.teamMemberships) {
      const role = leaderTeamIds.has(m.teamId) ? ('leader' as const) : ('member' as const);
      teams.push({
        teamId: m.team.id,
        teamName: m.team.name,
        departmentId: m.team.department.id,
        departmentName: m.team.department.name,
        role,
      });
      departmentMap.set(m.team.department.id, {
        id: m.team.department.id,
        name: m.team.department.name,
      });
    }

    const supervisorOfDepartments = user.supervisorOfDepartments.map((s) => ({
      id: s.department.id,
      name: s.department.name,
    }));
    for (const d of supervisorOfDepartments) {
      departmentMap.set(d.id, { id: d.id, name: d.name });
    }

    const preferences: UserPreferences =
      user.preferences != null && typeof user.preferences === 'object'
        ? (user.preferences as UserPreferences)
        : {};

    const response: MeResponse = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
        hasLocalLogin: user.passwordHash != null,
      },
      identity: {
        teams,
        departments: Array.from(departmentMap.values()),
        supervisorOfDepartments,
        userSpaces: user.userSpaces,
      },
      preferences,
    };
    return reply.send(response);
  });

  /** PATCH /api/v1/me – eigenes Profil (nur Anzeigename). */
  app.patch('/me', { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const body = patchMeBodySchema.parse(request.body);
    const updated = await request.server.prisma.user.update({
      where: { id: userId },
      data: { name: body.name },
      select: { id: true, name: true, email: true, isAdmin: true },
    });
    return reply.send(updated);
  });

  /** POST /api/v1/me/deactivate – Self-Deactivate (setzt deletedAt). Letzter Admin darf nicht. */
  app.post('/me/deactivate', { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const user = await request.server.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (user.isAdmin) {
      const otherAdmins = await request.server.prisma.user.count({
        where: { isAdmin: true, deletedAt: null, id: { not: userId } },
      });
      if (otherAdmins === 0) {
        return reply.status(403).send({
          error:
            'Der letzte Administrator kann den Account nicht deaktivieren. Bitte einen weiteren Admin anlegen.',
        });
      }
    }
    await request.server.prisma.session.deleteMany({ where: { userId } });
    await request.server.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });
    return reply.status(204).send();
  });

  /** GET /api/v1/me/preferences – nur Preferences (leichtgewichtig). */
  app.get('/me/preferences', { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const user = await request.server.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferences: true },
    });
    const preferences: UserPreferences =
      user.preferences != null && typeof user.preferences === 'object'
        ? (user.preferences as UserPreferences)
        : {};
    return reply.send(preferences);
  });

  /** PATCH /api/v1/me/preferences – Theme, sidebarPinned (partielles Merge). */
  app.patch('/me/preferences', { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const body = patchPreferencesBodySchema.parse(request.body);

    const current = await request.server.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferences: true },
    });
    const currentPrefs: UserPreferences =
      current.preferences != null && typeof current.preferences === 'object'
        ? (current.preferences as UserPreferences)
        : {};
    const merged: UserPreferences = {
      ...currentPrefs,
      ...(body.theme !== undefined && { theme: body.theme }),
      ...(body.sidebarPinned !== undefined && { sidebarPinned: body.sidebarPinned }),
      ...(body.locale !== undefined && { locale: body.locale }),
    };

    await request.server.prisma.user.update({
      where: { id: userId },
      data: { preferences: merged as object },
    });
    return reply.send(merged);
  });

  /** PATCH /api/v1/me/account – E-Mail und/oder Passwort (nur bei lokalem Login). */
  app.patch('/me/account', { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const body = patchAccountBodySchema.parse(request.body);

    const user = await request.server.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true, email: true },
    });
    if (user.passwordHash == null) {
      return reply.status(400).send({
        error:
          'Account wird per SSO verwaltet. E-Mail und Passwort können hier nicht geändert werden.',
      });
    }

    const data: { email?: string | null; passwordHash?: string } = {};

    if (body.email !== undefined) {
      if (body.email !== null) {
        const existing = await request.server.prisma.user.findUnique({
          where: { email: body.email },
          select: { id: true },
        });
        if (existing && existing.id !== userId) {
          return reply.status(409).send({ error: 'Diese E-Mail-Adresse wird bereits verwendet.' });
        }
      }
      data.email = body.email;
    }

    if (body.newPassword !== undefined) {
      if (!body.currentPassword) {
        return reply
          .status(400)
          .send({ error: 'Aktuelles Passwort ist erforderlich, um das Passwort zu ändern.' });
      }
      const valid = await verifyPassword(user.passwordHash, body.currentPassword);
      if (!valid) {
        return reply.status(401).send({ error: 'Aktuelles Passwort ist falsch.' });
      }
      data.passwordHash = await hashPassword(body.newPassword);
    }

    if (Object.keys(data).length === 0) {
      return reply
        .status(400)
        .send({ error: 'Nichts zum Aktualisieren angegeben (email oder newPassword).' });
    }

    await request.server.prisma.user.update({
      where: { id: userId },
      data,
    });
    return reply.status(204).send();
  });

  /** GET /api/v1/me/sessions – Liste der Sessions mit isCurrent. */
  app.get('/me/sessions', { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const currentSessionId = request.cookies[SESSION_COOKIE_NAME] ?? null;

    const sessions = await request.server.prisma.session.findMany({
      where: { userId },
      select: { id: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const list = sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: currentSessionId === s.id,
    }));
    return reply.send({ sessions: list });
  });

  /** DELETE /api/v1/me/sessions – alle anderen Sessions beenden (außer aktueller). */
  app.delete('/me/sessions', { preHandler: requireAuth }, async (request, reply) => {
    const userId = (request as { user: RequestUser }).user.id;
    const currentSessionId = request.cookies[SESSION_COOKIE_NAME];
    if (currentSessionId) {
      await request.server.prisma.session.deleteMany({
        where: { userId, id: { not: currentSessionId } },
      });
    }
    return reply.status(204).send();
  });

  /** DELETE /api/v1/me/sessions/:sessionId – einzelne Session widerrufen. */
  app.delete<{ Params: { sessionId: string } }>(
    '/me/sessions/:sessionId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = (request as { user: RequestUser }).user.id;
      const { sessionId } = sessionIdParamSchema.parse(request.params);

      const session = await request.server.prisma.session.findFirst({
        where: { id: sessionId, userId },
      });
      if (!session) {
        return reply.status(404).send({ error: 'Session nicht gefunden.' });
      }
      await request.server.prisma.session.delete({ where: { id: sessionId } });
      return reply.status(204).send();
    }
  );
};

export default meRoutes;
