import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

export type MeDraftsScopeParams =
  | { scope: 'personal' }
  | { scope: 'shared' }
  | { companyId: string }
  | { departmentId: string }
  | { teamId: string }
  | Record<string, never>;

export type DraftScopeType = 'team' | 'department' | 'company' | 'personal';

export type DraftDocumentItem = {
  id: string;
  title: string;
  contextId: string | null;
  updatedAt: string;
  createdAt?: string;
  scopeType: DraftScopeType;
  scopeId: string | null;
  scopeName: string;
};

export type OpenDraftRequestItem = {
  id: string;
  documentId: string;
  documentTitle: string;
  submittedById: string;
  submittedByName: string;
  submittedAt: string;
  status: string;
  scopeType: DraftScopeType;
  scopeId: string | null;
  scopeName: string;
};

export type MeDraftsResponse = {
  draftDocuments: DraftDocumentItem[];
  openDraftRequests: OpenDraftRequestItem[];
  limit: number;
  offset: number;
};

function buildDraftsQueryParams(
  params: MeDraftsScopeParams,
  options?: { limit?: number; offset?: number }
): string {
  const search = new URLSearchParams();
  if (options?.limit != null) search.set('limit', String(options.limit));
  if (options?.offset != null) search.set('offset', String(options.offset));
  if ('scope' in params && params.scope) search.set('scope', params.scope);
  if ('companyId' in params && params.companyId) search.set('companyId', params.companyId);
  if ('departmentId' in params && params.departmentId)
    search.set('departmentId', params.departmentId);
  if ('teamId' in params && params.teamId) search.set('teamId', params.teamId);
  return search.toString();
}

export function meDraftsQueryKey(
  params: MeDraftsScopeParams,
  options?: { limit?: number; offset?: number }
): unknown[] {
  const key: unknown[] = ['me', 'drafts'];
  if ('scope' in params && params.scope) key.push(params.scope);
  if ('companyId' in params && params.companyId) key.push('company', params.companyId);
  if ('departmentId' in params && params.departmentId) key.push('department', params.departmentId);
  if ('teamId' in params && params.teamId) key.push('team', params.teamId);
  if (options?.limit != null) key.push('limit', options.limit);
  if (options?.offset != null) key.push('offset', options.offset);
  return key;
}

export async function fetchMeDrafts(
  params: MeDraftsScopeParams,
  options?: { limit?: number; offset?: number }
): Promise<MeDraftsResponse> {
  const qs = buildDraftsQueryParams(params, options);
  const url = qs ? `/api/v1/me/drafts?${qs}` : '/api/v1/me/drafts';
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load drafts');
  return (await res.json()) as MeDraftsResponse;
}

/**
 * Drafts and open draft requests for a scope (or all if params empty).
 */
export function useMeDrafts(
  params: MeDraftsScopeParams,
  options?: { limit?: number; offset?: number; enabled?: boolean }
) {
  const queryKey = meDraftsQueryKey(params, {
    limit: options?.limit ?? 20,
    offset: options?.offset ?? 0,
  });
  return useQuery({
    queryKey,
    queryFn: () =>
      fetchMeDrafts(params, { limit: options?.limit ?? 20, offset: options?.offset ?? 0 }),
    enabled: options?.enabled !== false,
  });
}
