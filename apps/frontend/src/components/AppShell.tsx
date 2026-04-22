import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppShell as MantineAppShell,
  Stack,
  NavLink,
  Box,
  Menu,
  Text,
  Collapse,
  UnstyledButton,
  Group,
  ActionIcon,
  ScrollArea,
  Loader,
  Button,
  Badge,
  Divider,
} from '@mantine/core';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconChevronDown,
  IconChevronRight,
  IconLogout,
  IconSettings,
  IconShield,
  IconBug,
  IconLayoutDashboard,
  IconListSearch,
  IconUser,
  IconShare,
  IconBuildingSkyscraper,
  IconSitemap,
  IconUsersGroup,
  IconClipboardCheck,
  IconHelp,
  IconBell,
} from '@tabler/icons-react';
import { apiFetch } from '../api/client';
import { useMe, meQueryKey } from '../hooks/useMe';
import { useMeNotificationsUnreadTotal } from '../hooks/useMeNotificationsUnreadTotal';
import { useMeDrafts } from '../hooks/useMeDrafts';
import { useResolvedColorScheme } from '../hooks/useResolvedColorScheme';
import { DocopsLogo } from './DocopsLogo';

function isActive(path: string, current: string): boolean {
  if (path === '/') return current === '/';
  return current === path || current.startsWith(path + '/');
}

/** Shared styles for sidebar nav links (hover/active). Uses theme variables. */
function getNavLinkStyles(): { root: Record<string, unknown> } {
  return {
    root: {
      borderRadius: 'var(--mantine-radius-sm)',
      padding: '6px 12px',
      fontWeight: 400,
      fontSize: 'var(--mantine-font-size-md)',
    },
  };
}

/** Rolle aus MeResponse ableiten (gleiche Reihenfolge wie Backend: Admin > Company Lead > Department Lead > Team Lead > User). */
function getDisplayRole(me: {
  user: { isAdmin: boolean };
  identity: { companyLeads: unknown[]; departmentLeads: unknown[]; teams: { role: string }[] };
}): string {
  if (me.user.isAdmin) return 'Admin';
  if ((me.identity.companyLeads?.length ?? 0) > 0) return 'Company Lead';
  if ((me.identity.departmentLeads?.length ?? 0) > 0) return 'Department Lead';
  if (me.identity.teams?.some((t) => t.role === 'leader')) return 'Team Lead';
  return 'User';
}

type DepartmentWithTeams = { id: string; name: string; teams: { id: string; name: string }[] };
type DepartmentsRes = { items: DepartmentWithTeams[]; total: number };
type TeamsRes = { items: { id: string; name: string }[]; total: number };

type AdminUser = {
  id: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  deletedAt: Date | null;
  role: 'User' | 'Team Lead' | 'Department Lead' | 'Company Lead' | 'Admin';
};

export function AppShell() {
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
  /** Abteilung des ersten Team-Eintrags (für Nutzer ohne Lead-Rolle). */
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

  /** Ein einziges Department: Liste standardmäßig aufklappen, damit die Dokumentanzahl sichtbar ist. */
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
    onError: (err) => {
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

  function renderRoleBasedNav() {
    if (!me?.identity) {
      return (
        <>
          <NavLink
            data-sidebar-link
            component={Link}
            to="/company"
            label="Company"
            active={isActive('/company', location.pathname)}
            leftSection={<IconBuildingSkyscraper size={18} />}
            rightSection={
              companyCount !== undefined && companyCount > 0 ? (
                <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                  {companyCount}
                </Text>
              ) : null
            }
            styles={navLinkStyles}
          />
          <NavLink
            data-sidebar-link
            component={Link}
            to="/department"
            label="Department"
            active={isActive('/department', location.pathname)}
            leftSection={<IconSitemap size={18} />}
            styles={navLinkStyles}
          />
          <NavLink
            data-sidebar-link
            component={Link}
            to="/team"
            label="Team"
            active={isActive('/team', location.pathname)}
            leftSection={<IconUsersGroup size={18} />}
            styles={navLinkStyles}
          />
        </>
      );
    }

    if ((isCompanyLead || isAdmin) && companyDepartments?.items) {
      const depts = companyDepartments.items;
      const singleDeptDocumentCount =
        depts.length === 1 && typeof departmentCounts[depts[0].id] === 'number'
          ? departmentCounts[depts[0].id]
          : undefined;
      return (
        <>
          <NavLink
            data-sidebar-link
            component={Link}
            to="/company"
            label="Company"
            active={isActive('/company', location.pathname)}
            leftSection={<IconBuildingSkyscraper size={18} />}
            rightSection={
              companyCount !== undefined && companyCount > 0 ? (
                <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                  {companyCount}
                </Text>
              ) : null
            }
            styles={navLinkStyles}
          />
          <Box
            data-sidebar-parent
            style={{
              borderRadius: 'var(--mantine-radius-sm)',
              display: 'flex',
              flex: 1,
              minWidth: 0,
              minHeight: 'var(--mantine-nav-link-height, 44px)',
            }}
          >
            <Group
              gap={0}
              wrap="nowrap"
              style={{ alignItems: 'stretch', flex: 1, minHeight: '100%' }}
            >
              <UnstyledButton
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 'var(--mantine-nav-link-height, 44px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
                }}
                onClick={() => setDepartmentsSectionExpanded((v) => !v)}
              >
                <IconSitemap size={18} style={{ flexShrink: 0 }} />
                <Text size="sm" truncate>
                  Departments
                </Text>
              </UnstyledButton>
              {singleDeptDocumentCount !== undefined && singleDeptDocumentCount > 0 ? (
                <Text size="xs" c="var(--mantine-primary-color-filled)" component="span" px={4}>
                  {singleDeptDocumentCount}
                </Text>
              ) : null}
              <UnstyledButton
                style={{ flex: 0, padding: '2px 4px' }}
                onClick={() => setDepartmentsSectionExpanded((v) => !v)}
                aria-expanded={departmentsSectionExpanded}
              >
                {departmentsSectionExpanded ? (
                  <IconChevronDown size={16} style={{ display: 'block' }} />
                ) : (
                  <IconChevronRight size={16} style={{ display: 'block' }} />
                )}
              </UnstyledButton>
            </Group>
          </Box>
          <Collapse in={departmentsSectionExpanded}>
            <Box
              style={{
                borderLeft: '2px solid var(--mantine-color-gray-7)',
                marginLeft: 20,
                paddingLeft: 8,
                marginTop: 4,
                marginBottom: 4,
              }}
            >
              <Stack gap={0} pl={0}>
                {depts.map((dept) => (
                  <NavLink
                    key={dept.id}
                    data-sidebar-link
                    component={Link}
                    to={`/department/${dept.id}`}
                    label={dept.name}
                    active={isActive(`/department/${dept.id}`, location.pathname)}
                    rightSection={
                      departmentCounts[dept.id] !== undefined && departmentCounts[dept.id] > 0 ? (
                        <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                          {departmentCounts[dept.id]}
                        </Text>
                      ) : null
                    }
                    style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    styles={navLinkStyles}
                  />
                ))}
              </Stack>
            </Box>
          </Collapse>
          <Box
            data-sidebar-parent
            style={{
              borderRadius: 'var(--mantine-radius-sm)',
              display: 'flex',
              flex: 1,
              minWidth: 0,
              minHeight: 'var(--mantine-nav-link-height, 44px)',
            }}
          >
            <Group
              gap={0}
              wrap="nowrap"
              style={{ alignItems: 'stretch', flex: 1, minHeight: '100%' }}
            >
              <UnstyledButton
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 'var(--mantine-nav-link-height, 44px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
                }}
                onClick={() => setTeamsSectionExpanded((v) => !v)}
              >
                <IconUsersGroup size={18} style={{ flexShrink: 0 }} />
                <Text size="sm" truncate>
                  Teams
                </Text>
              </UnstyledButton>
              <UnstyledButton
                style={{ flex: 0, padding: '2px 4px' }}
                onClick={() => setTeamsSectionExpanded((v) => !v)}
                aria-expanded={teamsSectionExpanded}
              >
                {teamsSectionExpanded ? (
                  <IconChevronDown size={16} style={{ display: 'block' }} />
                ) : (
                  <IconChevronRight size={16} style={{ display: 'block' }} />
                )}
              </UnstyledButton>
            </Group>
          </Box>
          <Collapse in={teamsSectionExpanded}>
            <Box
              style={{
                borderLeft: '2px solid var(--mantine-color-gray-7)',
                marginLeft: 20,
                paddingLeft: 8,
                marginTop: 4,
                marginBottom: 4,
              }}
            >
              <Stack gap={0} pl={0}>
                {depts.map((dept) => (
                  <Box key={dept.id}>
                    <Text size="xs" fw={500} c="dimmed" mt="xs" mb={4}>
                      {dept.name}
                    </Text>
                    {(dept.teams ?? []).map((team) => (
                      <NavLink
                        key={team.id}
                        data-sidebar-link
                        component={Link}
                        to={`/team/${team.id}`}
                        label={team.name}
                        active={location.pathname === `/team/${team.id}`}
                        rightSection={
                          teamCounts[team.id] !== undefined && teamCounts[team.id] > 0 ? (
                            <Text
                              size="xs"
                              c="var(--mantine-primary-color-filled)"
                              component="span"
                            >
                              {teamCounts[team.id]}
                            </Text>
                          ) : null
                        }
                        pl="sm"
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        styles={navLinkStyles}
                      />
                    ))}
                  </Box>
                ))}
              </Stack>
            </Box>
          </Collapse>
        </>
      );
    }

    if (isDepartmentLead && departmentId && departmentTeams?.items) {
      const isTeamsExpanded = expandedDepartmentIds.has(departmentId);
      return (
        <>
          <NavLink
            data-sidebar-link
            component={Link}
            to="/company"
            label="Company"
            active={isActive('/company', location.pathname)}
            leftSection={<IconBuildingSkyscraper size={18} />}
            rightSection={
              companyCount !== undefined && companyCount > 0 ? (
                <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                  {companyCount}
                </Text>
              ) : null
            }
            styles={navLinkStyles}
          />
          <NavLink
            data-sidebar-link
            component={Link}
            to={`/department/${departmentId}`}
            label="Department"
            active={isActive(`/department/${departmentId}`, location.pathname)}
            leftSection={<IconSitemap size={18} />}
            rightSection={
              departmentCounts[departmentId] !== undefined && departmentCounts[departmentId] > 0 ? (
                <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                  {departmentCounts[departmentId]}
                </Text>
              ) : null
            }
            styles={navLinkStyles}
          />
          <Box
            data-sidebar-parent
            style={{
              borderRadius: 'var(--mantine-radius-sm)',
              display: 'flex',
              flex: 1,
              minWidth: 0,
              minHeight: 'var(--mantine-nav-link-height, 44px)',
            }}
          >
            <Group
              gap={0}
              wrap="nowrap"
              style={{ alignItems: 'stretch', flex: 1, minHeight: '100%' }}
            >
              <UnstyledButton
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 'var(--mantine-nav-link-height, 44px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
                }}
                onClick={() =>
                  setExpandedDepartmentIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(departmentId)) next.delete(departmentId);
                    else next.add(departmentId);
                    return next;
                  })
                }
              >
                <IconUsersGroup size={18} style={{ flexShrink: 0 }} />
                <Text size="sm" truncate>
                  Teams
                </Text>
              </UnstyledButton>
              <UnstyledButton
                style={{ flex: 0, padding: '2px 4px' }}
                onClick={() =>
                  setExpandedDepartmentIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(departmentId)) next.delete(departmentId);
                    else next.add(departmentId);
                    return next;
                  })
                }
                aria-expanded={isTeamsExpanded}
              >
                {isTeamsExpanded ? (
                  <IconChevronDown size={16} style={{ display: 'block' }} />
                ) : (
                  <IconChevronRight size={16} style={{ display: 'block' }} />
                )}
              </UnstyledButton>
            </Group>
          </Box>
          <Collapse in={isTeamsExpanded}>
            <Box
              style={{
                borderLeft: '2px solid var(--mantine-color-gray-7)',
                marginLeft: 20,
                paddingLeft: 8,
                marginTop: 4,
                marginBottom: 4,
              }}
            >
              <Stack gap={0} pl={0}>
                {departmentTeams.items.map((team) => (
                  <NavLink
                    key={team.id}
                    data-sidebar-link
                    component={Link}
                    to={`/team/${team.id}`}
                    label={team.name}
                    active={location.pathname === `/team/${team.id}`}
                    rightSection={
                      teamCounts[team.id] !== undefined && teamCounts[team.id] > 0 ? (
                        <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                          {teamCounts[team.id]}
                        </Text>
                      ) : null
                    }
                    pl="sm"
                    style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    styles={navLinkStyles}
                  />
                ))}
              </Stack>
            </Box>
          </Collapse>
        </>
      );
    }

    return (
      <>
        <NavLink
          data-sidebar-link
          component={Link}
          to="/company"
          label="Company"
          active={isActive('/company', location.pathname)}
          leftSection={<IconBuildingSkyscraper size={18} />}
          rightSection={
            companyCount !== undefined && companyCount > 0 ? (
              <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                {companyCount}
              </Text>
            ) : null
          }
          styles={navLinkStyles}
        />
        <NavLink
          data-sidebar-link
          component={Link}
          to={userDepartmentId ? `/department/${userDepartmentId}` : '/department'}
          label="Department"
          active={
            userDepartmentId
              ? isActive(`/department/${userDepartmentId}`, location.pathname)
              : isActive('/department', location.pathname)
          }
          leftSection={<IconSitemap size={18} />}
          rightSection={
            userDepartmentId &&
            departmentCounts[userDepartmentId] !== undefined &&
            departmentCounts[userDepartmentId] > 0 ? (
              <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                {departmentCounts[userDepartmentId]}
              </Text>
            ) : null
          }
          styles={navLinkStyles}
        />
        <NavLink
          data-sidebar-link
          component={Link}
          to={userTeamId ? `/team/${userTeamId}` : '/team'}
          label="Team"
          active={
            userTeamId
              ? isActive(`/team/${userTeamId}`, location.pathname)
              : isActive('/team', location.pathname)
          }
          leftSection={<IconUsersGroup size={18} />}
          rightSection={
            userTeamId && teamCounts[userTeamId] !== undefined && teamCounts[userTeamId] > 0 ? (
              <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                {teamCounts[userTeamId]}
              </Text>
            ) : null
          }
          styles={navLinkStyles}
        />
      </>
    );
  }

  return (
    <MantineAppShell navbar={{ width: 260, breakpoint: 'sm' }} padding={0} header={{ height: 0 }}>
      {showDebugMenu && (
        <Box
          style={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            zIndex: 1000,
          }}
        >
          <Menu position="bottom-end" shadow="md" width={320}>
            <Menu.Target>
              <ActionIcon variant="light" size="md" aria-label="Debug menu" color="grape">
                <IconBug size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>View as user</Menu.Label>
              {adminUsersLoading ? (
                <Menu.Item disabled>
                  <Loader size="xs" />
                </Menu.Item>
              ) : adminUsersError ? (
                <Menu.Item disabled>
                  <Text size="sm" c="dimmed">
                    Failed to load user list.
                  </Text>
                </Menu.Item>
              ) : (adminUsersRes?.items ?? []).length === 0 ? (
                <Menu.Item disabled>
                  <Text size="sm" c="dimmed">
                    No users available.
                  </Text>
                </Menu.Item>
              ) : (
                <ScrollArea.Autosize mah={320}>
                  {(adminUsersRes?.items ?? []).map((u) => (
                    <Menu.Item
                      key={u.id}
                      onClick={() => impersonateMutation.mutate(u.id)}
                      disabled={impersonateMutation.isPending}
                    >
                      <Stack gap={2}>
                        <Text size="sm" fw={500}>
                          {u.name}
                        </Text>
                        {u.email && (
                          <Text size="xs" c="dimmed">
                            {u.email}
                          </Text>
                        )}
                        <Badge size="xs" variant="light">
                          {u.role}
                        </Badge>
                      </Stack>
                    </Menu.Item>
                  ))}
                </ScrollArea.Autosize>
              )}
            </Menu.Dropdown>
          </Menu>
        </Box>
      )}

      <MantineAppShell.Navbar p="md">
        <Stack justify="space-between" style={{ height: '100%' }}>
          <Box data-sidebar-nav>
            <MantineAppShell.Section>
              <Link
                to="/"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <DocopsLogo width={40} height={40} />
                <Text component="span">
                  <Text
                    component="span"
                    c={resolvedColorScheme === 'dark' ? 'white' : 'dimmed'}
                    style={{ fontWeight: 500, fontSize: '1.5rem', letterSpacing: '-0.05em' }}
                  >
                    Docs
                  </Text>
                  <Text
                    component="span"
                    c="var(--mantine-primary-color-filled)"
                    style={{ fontWeight: 500, fontSize: '1.5rem', letterSpacing: '-0.05em' }}
                  >
                    Ops
                  </Text>
                </Text>
              </Link>
              <Divider my="sm" />
            </MantineAppShell.Section>
            <MantineAppShell.Section mt="xl">
              <Stack gap={4}>
                <NavLink
                  data-sidebar-link
                  component={Link}
                  to="/"
                  label="Dashboard"
                  active={isActive('/', location.pathname)}
                  leftSection={<IconLayoutDashboard size={18} />}
                  styles={navLinkStyles}
                />
                <NavLink
                  data-sidebar-link
                  component={Link}
                  to="/catalog"
                  label="Catalog"
                  active={isActive('/catalog', location.pathname)}
                  leftSection={<IconListSearch size={18} />}
                  rightSection={
                    catalogCount !== undefined && catalogCount > 0 ? (
                      <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                        {catalogCount}
                      </Text>
                    ) : null
                  }
                  styles={navLinkStyles}
                />
                <Text size="xs" fw={500} c="dimmed" mt="xs" mb={4}>
                  Organization
                </Text>
                {renderRoleBasedNav()}
                <Text size="xs" fw={500} c="dimmed" mt="xs" mb={4}>
                  Personal
                </Text>
                <NavLink
                  data-sidebar-link
                  component={Link}
                  to="/personal"
                  label="Personal"
                  active={isActive('/personal', location.pathname)}
                  leftSection={<IconUser size={18} />}
                  rightSection={
                    personalCount !== undefined && personalCount > 0 ? (
                      <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                        {personalCount}
                      </Text>
                    ) : null
                  }
                  styles={navLinkStyles}
                />
                <NavLink
                  data-sidebar-link
                  component={Link}
                  to="/notifications"
                  label="Notifications"
                  title="Unread in-app notifications (all categories)"
                  aria-label="Notifications: unread in-app activity across all types"
                  active={isActive('/notifications', location.pathname)}
                  leftSection={<IconBell size={18} />}
                  rightSection={
                    unreadNotificationsCount > 0 ? (
                      <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                        {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                      </Text>
                    ) : null
                  }
                  styles={navLinkStyles}
                />
                {hasReviewRights && (
                  <NavLink
                    data-sidebar-link
                    component={Link}
                    to="/reviews"
                    label="Reviews"
                    title="Open draft requests you can merge or reject"
                    aria-label="Reviews: open draft requests awaiting your decision"
                    active={isActive('/reviews', location.pathname)}
                    leftSection={<IconClipboardCheck size={18} />}
                    rightSection={
                      reviewsCount !== undefined && reviewsCount > 0 ? (
                        <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                          {reviewsCount}
                        </Text>
                      ) : null
                    }
                    styles={navLinkStyles}
                  />
                )}
                <NavLink
                  data-sidebar-link
                  component={Link}
                  to="/shared"
                  label="Shared"
                  active={isActive('/shared', location.pathname)}
                  leftSection={<IconShare size={18} />}
                  rightSection={
                    sharedCount !== undefined && sharedCount > 0 ? (
                      <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                        {sharedCount}
                      </Text>
                    ) : null
                  }
                  styles={navLinkStyles}
                />
              </Stack>
            </MantineAppShell.Section>
          </Box>
          <MantineAppShell.Section>
            <Divider my="sm" />
            <Menu
              position="top-end"
              shadow="md"
              width={200}
              opened={accountMenuOpen}
              onChange={setAccountMenuOpen}
            >
              <Menu.Target>
                <UnstyledButton
                  data-user-menu-trigger
                  style={{
                    display: 'block',
                    width: '100%',
                    cursor: 'pointer',
                    padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
                    borderRadius: 'var(--mantine-radius-sm)',
                  }}
                >
                  <Group justify="space-between" wrap="nowrap" align="center" gap="xs">
                    <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                      <Text size="sm" truncate>
                        {me?.user?.name ?? 'Account'}
                      </Text>
                      {me?.user?.email && (
                        <Text size="xs" c="dimmed" truncate>
                          {me?.user?.email}
                        </Text>
                      )}
                    </Stack>
                    <Box
                      component="span"
                      style={{
                        display: 'inline-flex',
                        flexShrink: 0,
                        transition: 'transform 0.2s ease',
                        transform: accountMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    >
                      <IconChevronDown size={14} />
                    </Box>
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown data-user-menu-dropdown>
                {me?.user?.isAdmin && (
                  <Menu.Item
                    component={Link}
                    to="/admin/users"
                    leftSection={<IconShield size={14} />}
                  >
                    Admin
                  </Menu.Item>
                )}
                <Menu.Item
                  component={Link}
                  to="/help/overview"
                  leftSection={<IconHelp size={14} />}
                >
                  Help
                </Menu.Item>
                <Menu.Item component={Link} to="/settings" leftSection={<IconSettings size={14} />}>
                  Settings
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconLogout size={14} />}
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                  color="red"
                >
                  Log out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </MantineAppShell.Section>
        </Stack>
      </MantineAppShell.Navbar>
      <MantineAppShell.Main>
        <Box
          py={{ base: 'md', md: 'lg', xl: 'xl' }}
          px={{ base: 'md', md: 'lg', xl: 'xl' }}
          style={{ minHeight: '100%' }}
        >
          {me?.impersonation?.active && (
            <Box
              py="xs"
              px="md"
              style={{
                position: 'fixed',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 900,
                maxWidth: 650,
                borderRadius: 'var(--mantine-radius-sm)',
                boxShadow: 'var(--mantine-shadow-md)',
                border:
                  resolvedColorScheme === 'dark'
                    ? '1px solid var(--mantine-color-dark-5)'
                    : '1px solid var(--mantine-color-yellow-4)',
              }}
              bg={resolvedColorScheme === 'dark' ? 'dark.6' : 'yellow.2'}
            >
              <Group justify="space-between" wrap="nowrap">
                <Text size="sm" c={resolvedColorScheme === 'dark' ? 'gray.3' : 'dark.7'}>
                  Viewing as <strong>{me.user.name}</strong>
                  {me.user.email ? ` (${me.user.email})` : ''}, {getDisplayRole(me)}. You are{' '}
                  {me.impersonation.realUser.name}.
                </Text>
                <Button
                  variant="filled"
                  size="xs"
                  color="grape"
                  onClick={() => stopImpersonateMutation.mutate()}
                  disabled={stopImpersonateMutation.isPending}
                >
                  End
                </Button>
              </Group>
            </Box>
          )}
          <Outlet />
        </Box>
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
