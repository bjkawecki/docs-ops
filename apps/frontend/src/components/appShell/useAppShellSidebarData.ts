import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';
import { useMe, meQueryKey } from '../../hooks/useMe';
import { useMeNotificationsUnreadTotal } from '../../hooks/useMeNotificationsUnreadTotal';
import { useMeDrafts } from '../../hooks/useMeDrafts';
import { useResolvedColorScheme } from '../../hooks/useResolvedColorScheme';
import type { AdminUser, DepartmentsRes, TeamsRes } from './appShellNavUtils.js';
import { getNavLinkStyles } from './appShellNavUtils.js';

export function useAppShellSidebarData() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedDepartmentIds, setExpandedDepartmentIds] = useState<Set<string>>(new Set());
  const [departmentsSectionExpanded, setDepartmentsSectionExpanded] = useState(false);
  const [teamsSectionExpanded, setTeamsSectionExpanded] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const resolvedColorScheme = useResolvedColorScheme();
  const navLinkStyles = useMemo(() => getNavLinkStyles(), []);

  const { data: me } = useMe();
  const { data: unreadNotificationsTotal } = useMeNotificationsUnreadTotal();
  const unreadNotificationsCount = unreadNotificationsTotal ?? 0;
  const isAdmin = me?.user?.isAdmin === true;
  const isImpersonating =
    me?.impersonation?.active === true ||
    (me?.impersonation != null && 'realUser' in me.impersonation);
  const showDebugMenu = isAdmin || isImpersonating || location.pathname.startsWith('/admin');
  const isCompanyLead = (me?.identity?.companyLeads?.length ?? 0) > 0;
  const isDepartmentLead = (me?.identity?.departmentLeads?.length ?? 0) > 0;
  const companyIdFromLead = me?.identity?.companyLeads?.[0]?.id;
  const departmentId = me?.identity?.departmentLeads?.[0]?.id;
  const userTeamId = me?.identity?.teams?.[0]?.teamId;
  const userDepartmentId = me?.identity?.teams?.[0]?.departmentId;
  const hasReviewRights =
    isAdmin ||
    isCompanyLead ||
    isDepartmentLead ||
    (me?.identity?.teams?.some((t) => t.role === 'leader') ?? false);

  const companyIdFromTeamOrDeptLead =
    me?.identity?.teams?.[0]?.companyId ?? me?.identity?.departmentLeads?.[0]?.companyId;

  const { data: firstCompany } = useQuery({
    queryKey: ['companies', 'first'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/companies?limit=1');
      if (!res.ok) throw new Error('Failed to load companies');
      const data = (await res.json()) as { items: { id: string }[] };
      return data.items[0] ?? null;
    },
    enabled: isAdmin && !companyIdFromLead && !companyIdFromTeamOrDeptLead,
  });

  const effectiveCompanyId =
    companyIdFromLead ?? companyIdFromTeamOrDeptLead ?? (isAdmin ? firstCompany?.id : undefined);

  const { data: companyDepartments } = useQuery<DepartmentsRes>({
    queryKey: ['companies', effectiveCompanyId, 'departments'],
    queryFn: async () => {
      if (!effectiveCompanyId) throw new Error('No company');
      const res = await apiFetch(`/api/v1/companies/${effectiveCompanyId}/departments?limit=100`);
      if (!res.ok) throw new Error('Failed to load departments');
      return res.json() as Promise<DepartmentsRes>;
    },
    enabled: !!effectiveCompanyId && (isCompanyLead || isAdmin),
  });

  useEffect(() => {
    const n = companyDepartments?.items?.length;
    if (n === 1) setDepartmentsSectionExpanded(true);
  }, [companyDepartments?.items?.length]);

  const { data: departmentTeams } = useQuery<TeamsRes>({
    queryKey: ['departments', departmentId, 'teams'],
    queryFn: async () => {
      if (!departmentId) throw new Error('No department');
      const res = await apiFetch(`/api/v1/departments/${departmentId}/teams?limit=100`);
      if (!res.ok) throw new Error('Failed to load teams');
      return res.json() as Promise<TeamsRes>;
    },
    enabled: !!departmentId && isDepartmentLead && !isCompanyLead,
  });

  const {
    data: adminUsersRes,
    isLoading: adminUsersLoading,
    isError: adminUsersError,
  } = useQuery<{
    items: AdminUser[];
    total: number;
  }>({
    queryKey: ['admin', 'users', 'list'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/admin/users?limit=100&includeDeactivated=false');
      if (!res.ok) throw new Error('Failed to load users');
      return (await res.json()) as { items: AdminUser[]; total: number };
    },
    enabled: showDebugMenu,
  });

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch('/api/v1/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? 'Impersonation failed');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
      void navigate('/', { replace: true });
      notifications.show({
        title: 'Ansicht gewechselt',
        message: 'You are now viewing the app as the selected user.',
        color: 'green',
      });
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Error', message: err.message, color: 'red' });
    },
  });

  const stopImpersonateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/admin/impersonate', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to end impersonation');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
      void navigate('/', { replace: true });
      notifications.show({
        title: 'Impersonation beendet',
        message: 'You are now back to your original account.',
        color: 'green',
      });
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Error', message: err.message, color: 'red' });
    },
  });

  const logout = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error('Logout failed');
    },
    onSuccess: () => {
      notifications.show({
        title: 'Logged out',
        message: 'You have been logged out.',
        color: 'green',
      });
      void navigate('/login', { replace: true });
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Logout failed', message: err.message, color: 'red' });
    },
  });

  const scopeIdsForCounts = useMemo(() => {
    const deptIds: string[] = [];
    const teamIds: string[] = [];
    if (companyDepartments?.items) {
      for (const d of companyDepartments.items) {
        deptIds.push(d.id);
        for (const t of d.teams ?? []) teamIds.push(t.id);
      }
    } else if (departmentTeams?.items && departmentId) {
      deptIds.push(departmentId);
      for (const t of departmentTeams.items) teamIds.push(t.id);
    } else {
      if (userDepartmentId) deptIds.push(userDepartmentId);
      if (userTeamId) teamIds.push(userTeamId);
    }
    return { departmentIds: deptIds, teamIds };
  }, [
    companyDepartments?.items,
    departmentTeams?.items,
    departmentId,
    userTeamId,
    userDepartmentId,
  ]);

  const { data: companyCount } = useQuery({
    queryKey: ['catalog-documents', 'count', 'company', effectiveCompanyId],
    queryFn: async (): Promise<number> => {
      const res = await apiFetch(
        `/api/v1/documents?companyId=${effectiveCompanyId}&publishedOnly=true&limit=1&offset=0`
      );
      if (!res.ok) throw new Error('Failed to load count');
      const data = (await res.json()) as { total: number };
      return data.total;
    },
    enabled: !!me?.identity && !!effectiveCompanyId,
  });

  const { data: catalogCount } = useQuery({
    queryKey: ['catalog-documents', 'count', 'catalog'],
    queryFn: async (): Promise<number> => {
      const res = await apiFetch('/api/v1/documents?limit=1&offset=0');
      if (!res.ok) throw new Error('Failed to load count');
      const data = (await res.json()) as { total: number };
      return data.total;
    },
    enabled: !!me?.identity,
  });

  const { data: personalCount } = useQuery({
    queryKey: ['me', 'personal-documents', 'count'],
    queryFn: async (): Promise<number> => {
      const res = await apiFetch(
        '/api/v1/me/personal-documents?limit=1&offset=0&publishedOnly=true'
      );
      if (!res.ok) throw new Error('Failed to load count');
      const data = (await res.json()) as { total: number };
      return data.total;
    },
    enabled: !!me?.identity,
  });

  const { data: sharedCount } = useQuery({
    queryKey: ['me', 'shared-documents', 'count'],
    queryFn: async (): Promise<number> => {
      const res = await apiFetch('/api/v1/me/shared-documents?limit=1&offset=0&publishedOnly=true');
      if (!res.ok) throw new Error('Failed to load count');
      const data = (await res.json()) as { total: number };
      return data.total;
    },
    enabled: !!me?.identity,
  });

  const { data: draftsData } = useMeDrafts({}, { limit: 100, offset: 0, enabled: hasReviewRights });
  const reviewsCount = draftsData?.openDraftRequests?.length ?? undefined;

  const scopeCountQueries = useQueries({
    queries: [
      ...scopeIdsForCounts.departmentIds.map((id) => ({
        queryKey: ['catalog-documents', 'count', 'department', id] as const,
        queryFn: async (): Promise<number> => {
          const res = await apiFetch(
            `/api/v1/documents?departmentId=${id}&publishedOnly=true&limit=1&offset=0`
          );
          if (!res.ok) throw new Error('Failed to load count');
          const data = (await res.json()) as { total: number };
          return data.total;
        },
        enabled: !!me?.identity,
      })),
      ...scopeIdsForCounts.teamIds.map((id) => ({
        queryKey: ['catalog-documents', 'count', 'team', id] as const,
        queryFn: async (): Promise<number> => {
          const res = await apiFetch(
            `/api/v1/documents?teamId=${id}&publishedOnly=true&limit=1&offset=0`
          );
          if (!res.ok) throw new Error('Failed to load count');
          const data = (await res.json()) as { total: number };
          return data.total;
        },
        enabled: !!me?.identity,
      })),
    ],
  });

  const departmentCounts = useMemo(() => {
    const map: Record<string, number> = {};
    scopeIdsForCounts.departmentIds.forEach((id, i) => {
      const result = scopeCountQueries[i]?.data;
      if (typeof result === 'number') map[id] = result;
    });
    return map;
  }, [scopeIdsForCounts.departmentIds, scopeCountQueries]);

  const teamCounts = useMemo(() => {
    const map: Record<string, number> = {};
    const offset = scopeIdsForCounts.departmentIds.length;
    scopeIdsForCounts.teamIds.forEach((id, i) => {
      const result = scopeCountQueries[offset + i]?.data;
      if (typeof result === 'number') map[id] = result;
    });
    return map;
  }, [scopeIdsForCounts.teamIds, scopeIdsForCounts.departmentIds.length, scopeCountQueries]);

  return {
    location,
    expandedDepartmentIds,
    setExpandedDepartmentIds,
    departmentsSectionExpanded,
    setDepartmentsSectionExpanded,
    teamsSectionExpanded,
    setTeamsSectionExpanded,
    accountMenuOpen,
    setAccountMenuOpen,
    resolvedColorScheme,
    navLinkStyles,
    me,
    unreadNotificationsCount,
    isAdmin,
    isImpersonating,
    showDebugMenu,
    isCompanyLead,
    isDepartmentLead,
    departmentId,
    userTeamId,
    userDepartmentId,
    hasReviewRights,
    companyDepartments,
    departmentTeams,
    adminUsersRes,
    adminUsersLoading,
    adminUsersError,
    impersonateMutation,
    stopImpersonateMutation,
    logout,
    companyCount,
    catalogCount,
    personalCount,
    sharedCount,
    reviewsCount,
    departmentCounts,
    teamCounts,
  };
}
