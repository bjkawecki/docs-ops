import type { PaginationQuery } from '../../schemas/contexts.js';

type OwnerScopedQuery = {
  companyId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
  ownerUserId?: string | null;
};

export type { PaginationQuery, OwnerScopedQuery };
