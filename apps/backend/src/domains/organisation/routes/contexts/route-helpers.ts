import type { OwnerScopedQuery } from './route-types.js';

function ownerWhereFromQuery(query: OwnerScopedQuery, userId: string) {
  return {
    ...(query.companyId != null && { owner: { companyId: query.companyId } }),
    ...(query.departmentId != null && { owner: { departmentId: query.departmentId } }),
    ...(query.teamId != null && { owner: { teamId: query.teamId } }),
    ...(query.ownerUserId === 'me' && { owner: { ownerUserId: userId } }),
  };
}

function parseIsoDateOrNull(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

export { ownerWhereFromQuery, parseIsoDateOrNull };
