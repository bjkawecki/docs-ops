import { useMemo, useState } from 'react';
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
  Modal,
  ScrollArea,
  Loader,
  Button,
  Badge,
  Divider,
  useMantineColorScheme,
  useMantineTheme,
} from '@mantine/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
} from '@tabler/icons-react';
import { apiFetch } from '../api/client';
import { useMe, meQueryKey } from '../hooks/useMe';
import { DocopsLogo } from './DocopsLogo';

function isActive(path: string, current: string): boolean {
  if (path === '/') return current === '/';
  return current === path || current.startsWith(path + '/');
}

/** Gemeinsame Styles für Sidebar-NavLinks (Hover/Active). Nutzt Theme-Variablen. */
function getNavLinkStyles(): { root: Record<string, unknown> } {
  return {
    root: {
      borderRadius: 'var(--mantine-radius-sm)',
      minHeight: 'var(--mantine-nav-link-height, 44px)',
      padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
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
  const [impersonateModalOpen, setImpersonateModalOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const { colorScheme } = useMantineColorScheme();
  const theme = useMantineTheme();
  const navLinkStyles = useMemo(() => getNavLinkStyles(), []);
  const sidebarOther = (theme as { other?: Record<string, string> }).other;
  const sidebarCss = useMemo(() => {
    const hoverDark = sidebarOther?.sidebarHover ?? 'var(--mantine-color-dark-6)';
    const hoverLight = sidebarOther?.sidebarHoverLight ?? 'var(--mantine-color-gray-1)';
    const activeDark = sidebarOther?.sidebarActive ?? 'var(--mantine-color-dark-4)';
    const activeLight = sidebarOther?.sidebarActiveLight ?? 'var(--mantine-color-gray-2)';
    return `[data-mantine-color-scheme="dark"] [data-sidebar-parent]:hover, [data-mantine-color-scheme="dark"] [data-user-menu-trigger]:hover, [data-mantine-color-scheme="dark"] [data-sidebar-nav] [data-sidebar-link]:hover { background-color: ${hoverDark}; border-radius: var(--mantine-radius-sm); } [data-mantine-color-scheme="light"] [data-sidebar-parent]:hover, [data-mantine-color-scheme="light"] [data-user-menu-trigger]:hover, [data-mantine-color-scheme="light"] [data-sidebar-nav] [data-sidebar-link]:hover { background-color: ${hoverLight}; border-radius: var(--mantine-radius-sm); } [data-mantine-color-scheme="dark"] [data-sidebar-nav] [data-active] { background-color: ${activeDark}; border-radius: var(--mantine-radius-sm); } [data-mantine-color-scheme="light"] [data-sidebar-nav] [data-active] { background-color: ${activeLight}; border-radius: var(--mantine-radius-sm); }`;
  }, [sidebarOther]);
  const { data: me } = useMe();
  const isAdmin = me?.user?.isAdmin === true;
  const showDebugMenu = isAdmin || me?.impersonation?.active === true;
  const isCompanyLead = (me?.identity?.companyLeads?.length ?? 0) > 0;
  const isDepartmentLead = (me?.identity?.departmentLeads?.length ?? 0) > 0;
  const companyIdFromLead = me?.identity?.companyLeads?.[0]?.id;
  const departmentId = me?.identity?.departmentLeads?.[0]?.id;

  const { data: firstCompany } = useQuery({
    queryKey: ['companies', 'first'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/companies?limit=1');
      if (!res.ok) throw new Error('Failed to load companies');
      const data = (await res.json()) as { items: { id: string }[] };
      return data.items[0] ?? null;
    },
    enabled: isAdmin && !companyIdFromLead,
  });

  const effectiveCompanyId = companyIdFromLead ?? firstCompany?.id;

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
    enabled: impersonateModalOpen && showDebugMenu,
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
        throw new Error(err.error ?? 'Impersonation fehlgeschlagen');
      }
    },
    onSuccess: () => {
      setImpersonateModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
      void navigate('/', { replace: true });
      notifications.show({
        title: 'Ansicht gewechselt',
        message: 'Sie sehen die App jetzt als den gewählten Nutzer.',
        color: 'green',
      });
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Fehler', message: err.message, color: 'red' });
    },
  });

  const stopImpersonateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/admin/impersonate', { method: 'DELETE' });
      if (!res.ok) throw new Error('Beenden fehlgeschlagen');
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
      notifications.show({ title: 'Fehler', message: err.message, color: 'red' });
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
            fw={600}
            styles={navLinkStyles}
          />
          <NavLink
            data-sidebar-link
            component={Link}
            to="/department"
            label="Department"
            active={isActive('/department', location.pathname)}
            leftSection={<IconSitemap size={18} />}
            fw={600}
            styles={navLinkStyles}
          />
          <NavLink
            data-sidebar-link
            component={Link}
            to="/team"
            label="Team"
            active={isActive('/team', location.pathname)}
            leftSection={<IconUsersGroup size={18} />}
            fw={600}
            styles={navLinkStyles}
          />
        </>
      );
    }

    if ((isCompanyLead || isAdmin) && companyDepartments?.items) {
      return (
        <>
          <NavLink
            data-sidebar-link
            component={Link}
            to="/company"
            label="Company"
            active={isActive('/company', location.pathname)}
            leftSection={<IconBuildingSkyscraper size={18} />}
            fw={600}
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
                <Text size="sm" fw={600} truncate>
                  Departments
                </Text>
              </UnstyledButton>
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
                {companyDepartments.items.map((dept) => (
                  <NavLink
                    key={dept.id}
                    data-sidebar-link
                    component={Link}
                    to={`/department/${dept.id}`}
                    label={dept.name}
                    active={isActive(`/department/${dept.id}`, location.pathname)}
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
                <Text size="sm" fw={600} truncate>
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
                {companyDepartments.items.map((dept) => (
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
            fw={600}
            styles={navLinkStyles}
          />
          <NavLink
            component={Link}
            to={`/department/${departmentId}`}
            label="Department"
            active={isActive(`/department/${departmentId}`, location.pathname)}
            leftSection={<IconSitemap size={18} />}
            fw={600}
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
                <Text size="sm" fw={600} truncate>
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
          component={Link}
          to="/company"
          label="Company"
          active={isActive('/company', location.pathname)}
          leftSection={<IconBuildingSkyscraper size={18} />}
          fw={600}
          styles={navLinkStyles}
        />
        <NavLink
          component={Link}
          to="/department"
          label="Department"
          active={isActive('/department', location.pathname)}
          leftSection={<IconSitemap size={18} />}
          fw={600}
          styles={navLinkStyles}
        />
        <NavLink
          component={Link}
          to="/team"
          label="Team"
          active={isActive('/team', location.pathname)}
          leftSection={<IconUsersGroup size={18} />}
          fw={600}
          styles={navLinkStyles}
        />
      </>
    );
  }

  return (
    <MantineAppShell navbar={{ width: 260, breakpoint: 'sm' }} padding="md" header={{ height: 0 }}>
      {showDebugMenu && (
        <Box
          style={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            zIndex: 1000,
          }}
        >
          <Menu position="bottom-end" shadow="md" width={220}>
            <Menu.Target>
              <ActionIcon variant="light" size="md" aria-label="Debug-Menü" color="grape">
                <IconBug size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                onClick={() => setImpersonateModalOpen(true)}
                leftSection={<IconShield size={14} />}
              >
                Ansicht als Nutzer
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Box>
      )}

      <Modal
        title="Ansicht als Nutzer"
        opened={impersonateModalOpen}
        onClose={() => setImpersonateModalOpen(false)}
        size="sm"
      >
        {adminUsersLoading ? (
          <Loader size="sm" />
        ) : adminUsersError ? (
          <Text size="sm" c="dimmed">
            Nutzerliste konnte nicht geladen werden.
          </Text>
        ) : (
          <ScrollArea.Autosize mah={320}>
            <Stack gap={4}>
              {(adminUsersRes?.items ?? []).length === 0 ? (
                <Text size="sm" c="dimmed">
                  Keine Nutzer vorhanden.
                </Text>
              ) : (
                (adminUsersRes?.items ?? []).map((u) => (
                  <UnstyledButton
                    key={u.id}
                    style={{ textAlign: 'left', padding: '6px 8px', borderRadius: 4 }}
                    onClick={() => impersonateMutation.mutate(u.id)}
                    disabled={impersonateMutation.isPending}
                  >
                    <Text size="sm" fw={500}>
                      {u.name}
                    </Text>
                    {u.email && (
                      <Text size="xs" c="dimmed">
                        {u.email}
                      </Text>
                    )}
                    <Badge size="xs" variant="light" mt={4}>
                      {u.role}
                    </Badge>
                  </UnstyledButton>
                ))
              )}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Modal>

      <MantineAppShell.Navbar
        p="md"
        style={{
          backgroundColor:
            colorScheme === 'dark'
              ? (sidebarOther?.sidebarBg ?? 'var(--mantine-color-dark-8)')
              : (sidebarOther?.sidebarBgLight ?? 'var(--mantine-color-gray-0)'),
        }}
      >
        <style>{sidebarCss}</style>
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
                <span style={{ fontWeight: 600 }}>DocsOps</span>
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
                  fw={600}
                  styles={navLinkStyles}
                />
                <NavLink
                  data-sidebar-link
                  component={Link}
                  to="/catalog"
                  label="Catalog"
                  active={isActive('/catalog', location.pathname)}
                  leftSection={<IconListSearch size={18} />}
                  fw={600}
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
                  fw={600}
                  styles={navLinkStyles}
                />
                <NavLink
                  data-sidebar-link
                  component={Link}
                  to="/shared"
                  label="Shared"
                  active={isActive('/shared', location.pathname)}
                  leftSection={<IconShare size={18} />}
                  fw={600}
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
                      <Text size="sm" fw={600} truncate>
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
              <Menu.Dropdown>
                {me?.user?.isAdmin && (
                  <Menu.Item
                    component={Link}
                    to="/admin/users"
                    leftSection={<IconShield size={14} />}
                  >
                    Admin
                  </Menu.Item>
                )}
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
              background:
                colorScheme === 'dark'
                  ? 'var(--mantine-color-dark-6)'
                  : 'var(--mantine-color-yellow-2)',
              border:
                colorScheme === 'dark'
                  ? '1px solid var(--mantine-color-dark-5)'
                  : '1px solid var(--mantine-color-yellow-4)',
            }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm" c={colorScheme === 'dark' ? 'gray.3' : 'dark.7'}>
                Ansicht als <strong>{me.user.name}</strong>
                {me.user.email ? ` (${me.user.email})` : ''}, {getDisplayRole(me)}. Du bist{' '}
                {me.impersonation.realUser.name}.
              </Text>
              <Button
                variant="filled"
                size="xs"
                color="grape"
                onClick={() => stopImpersonateMutation.mutate()}
                disabled={stopImpersonateMutation.isPending}
              >
                Beenden
              </Button>
            </Group>
          </Box>
        )}
        <Outlet />
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
