import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type {
  CompanyPeopleResponse,
  DepartmentPeopleResponse,
  TeamPeopleResponse,
} from '../api/scopePeople-types';

const STALE_MS = 30_000;

export const scopePeopleKeys = {
  team: (teamId: string) => ['scope-people', 'team', teamId] as const,
  department: (departmentId: string) => ['scope-people', 'department', departmentId] as const,
  company: (companyId: string) => ['scope-people', 'company', companyId] as const,
};

async function fetchTeamPeople(teamId: string): Promise<TeamPeopleResponse> {
  const res = await apiFetch(`/api/v1/teams/${teamId}/people`);
  if (!res.ok) throw new Error('Failed to load team people');
  return (await res.json()) as TeamPeopleResponse;
}

async function fetchDepartmentPeople(departmentId: string): Promise<DepartmentPeopleResponse> {
  const res = await apiFetch(`/api/v1/departments/${departmentId}/people`);
  if (!res.ok) throw new Error('Failed to load department people');
  return (await res.json()) as DepartmentPeopleResponse;
}

async function fetchCompanyPeople(companyId: string): Promise<CompanyPeopleResponse> {
  const res = await apiFetch(`/api/v1/companies/${companyId}/people`);
  if (!res.ok) throw new Error('Failed to load company people');
  return (await res.json()) as CompanyPeopleResponse;
}

export function useTeamPeople(teamId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: scopePeopleKeys.team(teamId ?? ''),
    queryFn: () => fetchTeamPeople(teamId!),
    enabled: enabled && !!teamId,
    staleTime: STALE_MS,
  });
}

export function useDepartmentPeople(departmentId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: scopePeopleKeys.department(departmentId ?? ''),
    queryFn: () => fetchDepartmentPeople(departmentId!),
    enabled: enabled && !!departmentId,
    staleTime: STALE_MS,
  });
}

export function useCompanyPeople(companyId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: scopePeopleKeys.company(companyId ?? ''),
    queryFn: () => fetchCompanyPeople(companyId!),
    enabled: enabled && !!companyId,
    staleTime: STALE_MS,
  });
}
