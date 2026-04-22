import type { SortByField, SortOrder } from './adminUsersTypes';

export function buildUsersQuery(params: {
  limit: number;
  offset: number;
  includeDeactivated: boolean;
  search: string;
  sortBy: SortByField | null;
  sortOrder: SortOrder;
}) {
  const sp = new URLSearchParams();
  sp.set('limit', String(params.limit));
  sp.set('offset', String(params.offset));
  if (params.includeDeactivated) sp.set('includeDeactivated', 'true');
  if (params.search.trim()) sp.set('search', params.search.trim());
  if (params.sortBy) {
    sp.set('sortBy', params.sortBy);
    sp.set('sortOrder', params.sortOrder);
  }
  return `/api/v1/admin/users?${sp.toString()}`;
}
