import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { CanWriteInScopeResponse } from '../api/me-types';

const STALE_MS = 30_000;

export type CanWriteInScopeParams =
  | { scope: 'company'; companyId: string }
  | { scope: 'department'; departmentId: string }
  | { scope: 'team'; teamId: string };

function buildCanWriteInScopeUrl(params: CanWriteInScopeParams): string {
  const search = new URLSearchParams({ scope: params.scope });
  if (params.scope === 'company') search.set('companyId', params.companyId);
  if (params.scope === 'department') search.set('departmentId', params.departmentId);
  if (params.scope === 'team') search.set('teamId', params.teamId);
  return `/api/v1/me/can-write-in-scope?${search}`;
}

export function canWriteInScopeQueryKey(params: CanWriteInScopeParams | null) {
  if (params == null) return ['me', 'can-write-in-scope', 'disabled'] as const;
  if (params.scope === 'company') {
    return ['me', 'can-write-in-scope', 'company', params.companyId] as const;
  }
  if (params.scope === 'department') {
    return ['me', 'can-write-in-scope', 'department', params.departmentId] as const;
  }
  return ['me', 'can-write-in-scope', 'team', params.teamId] as const;
}

async function fetchCanWriteInScope(
  params: CanWriteInScopeParams
): Promise<CanWriteInScopeResponse> {
  const res = await apiFetch(buildCanWriteInScopeUrl(params));
  if (!res.ok) throw new Error('Failed to load scope write permission');
  return (await res.json()) as CanWriteInScopeResponse;
}

export function useCanWriteInScope(params: CanWriteInScopeParams | null) {
  const enabled =
    params != null &&
    ((params.scope === 'company' && params.companyId.length > 0) ||
      (params.scope === 'department' && params.departmentId.length > 0) ||
      (params.scope === 'team' && params.teamId.length > 0));

  return useQuery({
    queryKey: canWriteInScopeQueryKey(params),
    queryFn: () => fetchCanWriteInScope(params!),
    enabled,
    staleTime: STALE_MS,
  });
}
