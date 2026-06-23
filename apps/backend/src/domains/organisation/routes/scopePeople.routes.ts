import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  requireAuthPreHandler,
  getEffectiveUserId,
  type RequestWithUser,
} from '../../auth/middleware.js';
import { canViewScopePeople } from '../permissions/scopeVisibility.js';
import {
  companyIdParamSchema,
  departmentIdParamSchema,
  teamIdParamSchema,
} from '../schemas/assignments.js';
import {
  companyPeopleResponseSchema,
  departmentPeopleResponseSchema,
  teamPeopleResponseSchema,
} from '../schemas/scopePeople.js';
import {
  getCompanyPeople,
  getDepartmentPeople,
  getTeamPeople,
} from '../services/scopePeopleService.js';

const scopePeopleRoutes: FastifyPluginAsync = (app: FastifyInstance) => {
  app.get(
    '/teams/:teamId/people',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { teamId } = teamIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canViewScopePeople(request.server.prisma, userId, {
        type: 'team',
        teamId,
      });
      if (!allowed) return reply.status(403).send({ error: 'No access to team people' });

      const data = await getTeamPeople(request.server.prisma, teamId);
      return reply.send(teamPeopleResponseSchema.parse(data));
    }
  );

  app.get(
    '/departments/:departmentId/people',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { departmentId } = departmentIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canViewScopePeople(request.server.prisma, userId, {
        type: 'department',
        departmentId,
      });
      if (!allowed) return reply.status(403).send({ error: 'No access to department people' });

      const data = await getDepartmentPeople(request.server.prisma, departmentId);
      return reply.send(departmentPeopleResponseSchema.parse(data));
    }
  );

  app.get(
    '/companies/:companyId/people',
    { preHandler: requireAuthPreHandler },
    async (request, reply) => {
      const { companyId } = companyIdParamSchema.parse(request.params);
      const userId = getEffectiveUserId(request as RequestWithUser);

      const allowed = await canViewScopePeople(request.server.prisma, userId, {
        type: 'company',
        companyId,
      });
      if (!allowed) return reply.status(403).send({ error: 'No access to company people' });

      const data = await getCompanyPeople(request.server.prisma, companyId);
      return reply.send(companyPeopleResponseSchema.parse(data));
    }
  );

  return Promise.resolve();
};

export default scopePeopleRoutes;
