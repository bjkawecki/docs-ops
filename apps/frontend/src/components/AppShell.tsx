import { useState } from 'react';
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
  Tooltip,
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
      return res.json();
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
      queryClient.invalidateQueries({ queryKey: meQueryKey });
      navigate('/', { replace: true });
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
      queryClient.invalidateQueries({ queryKey: meQueryKey });
      navigate('/', { replace: true });
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
      navigate('/login', { replace: true });
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
            component={Link}
            to="/company"
            label="Company"
            active={isActive('/company', location.pathname)}
            leftSection={<IconBuildingSkyscraper size={18} />}
            fw={600}
          />
          <NavLink
            component={Link}
            to="/department"
            label="Department"
            active={isActive('/department', location.pathname)}
            leftSection={<IconSitemap size={18} />}
            fw={600}
          />
          <NavLink
            component={Link}
            to="/team"
            label="Team"
            active={isActive('/team', location.pathname)}
            leftSection={<IconUsersGroup size={18} />}
            fw={600}
          />
        </>
      );
    }

    if ((isCompanyLead || isAdmin) && companyDepartments?.items) {
      return (
        <>
          <NavLink
            component={Link}
            to="/company"
            label="Company"
            active={isActive('/company', location.pathname)}
            leftSection={<IconBuildingSkyscraper size={18} />}
            fw={600}
          />
          <Group gap={0} wrap="nowrap" style={{ alignItems: 'stretch' }}>
            <UnstyledButton
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
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
                    component={Link}
                    to={`/department/${dept.id}`}
                    label={dept.name}
                    active={isActive(`/department/${dept.id}`, location.pathname)}
                    style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  />
                ))}
              </Stack>
            </Box>
          </Collapse>
          <Group gap={0} wrap="nowrap" style={{ alignItems: 'stretch' }}>
            <UnstyledButton
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
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
                      <Tooltip key={team.id} label={team.name} openDelay={300}>
                        <NavLink
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
                        />
                      </Tooltip>
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
            component={Link}
            to="/company"
            label="Company"
            active={isActive('/company', location.pathname)}
            leftSection={<IconBuildingSkyscraper size={18} />}
            fw={600}
          />
          <NavLink
            component={Link}
            to={`/department/${departmentId}`}
            label="Department"
            active={isActive(`/department/${departmentId}`, location.pathname)}
            leftSection={<IconSitemap size={18} />}
            fw={600}
          />
          <Group gap={0} wrap="nowrap" style={{ alignItems: 'stretch' }}>
            <UnstyledButton
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
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
                  <Tooltip key={team.id} label={team.name} openDelay={300}>
                    <NavLink
                      component={Link}
                      to={`/team/${team.id}`}
                      label={team.name}
                      active={location.pathname === `/team/${team.id}`}
                      pl="sm"
                      style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    />
                  </Tooltip>
                ))}
              </Stack>
            </Box>
          </Collapse>
        </>
      );
    }

    const teams = me.identity.teams ?? [];
    return (
      <>
        <NavLink
          component={Link}
          to="/company"
          label="Company"
          active={isActive('/company', location.pathname)}
          leftSection={<IconBuildingSkyscraper size={18} />}
          fw={600}
        />
        <NavLink
          component={Link}
          to="/team"
          label="Team"
          active={isActive('/team', location.pathname)}
          leftSection={<IconUsersGroup size={18} />}
          fw={600}
        />
        {teams.length > 0 &&
          teams.map((t) => (
            <Tooltip key={t.teamId} label={t.teamName} openDelay={300}>
              <NavLink
                component={Link}
                to={`/team/${t.teamId}`}
                label={t.teamName}
                active={location.pathname === `/team/${t.teamId}`}
                pl="lg"
                style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              />
            </Tooltip>
          ))}
      </>
    );
  }

  return (
    <MantineAppShell navbar={{ width: 220, breakpoint: 'sm' }} padding="md" header={{ height: 0 }}>
      {showDebugMenu && (
        <Box
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 1000,
          }}
        >
          <Menu position="bottom-end" shadow="md" width={220}>
            <Menu.Target>
              <ActionIcon variant="subtle" size="md" aria-label="Debug-Menü" color="gray">
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

      <MantineAppShell.Navbar p="md">
        <Stack justify="space-between" style={{ height: '100%' }}>
          <Box>
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
                  component={Link}
                  to="/"
                  label="Dashboard"
                  active={isActive('/', location.pathname)}
                  leftSection={<IconLayoutDashboard size={18} />}
                  fw={600}
                />
                <NavLink
                  component={Link}
                  to="/catalog"
                  label="Catalog"
                  active={isActive('/catalog', location.pathname)}
                  leftSection={<IconListSearch size={18} />}
                  fw={600}
                />
                <Text size="xs" fw={500} c="dimmed" mt="xs" mb={4}>
                  Organization
                </Text>
                {renderRoleBasedNav()}
                <Text size="xs" fw={500} c="dimmed" mt="xs" mb={4}>
                  Personal
                </Text>
                <NavLink
                  component={Link}
                  to="/personal"
                  label="Personal"
                  active={isActive('/personal', location.pathname)}
                  leftSection={<IconUser size={18} />}
                  fw={600}
                />
                <NavLink
                  component={Link}
                  to="/shared"
                  label="Shared"
                  active={isActive('/shared', location.pathname)}
                  leftSection={<IconShare size={18} />}
                  fw={600}
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
                <NavLink
                  label={me?.user?.email ?? me?.user?.name ?? 'Account'}
                  rightSection={
                    <Box
                      component="span"
                      style={{
                        display: 'inline-flex',
                        transition: 'transform 0.2s ease',
                        transform: accountMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    >
                      <IconChevronDown size={14} />
                    </Box>
                  }
                  style={{ cursor: 'pointer' }}
                />
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
            mb="md"
            style={{
              background: 'var(--mantine-color-yellow-1)',
              borderBottom: '1px solid var(--mantine-color-yellow-3)',
            }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm" c="dark.8">
                Ansicht als <strong>{me.user.name}</strong>
                {me.user.email ? ` (${me.user.email})` : ''}, {getDisplayRole(me)}. Du bist{' '}
                {me.impersonation.realUser.name}.
              </Text>
              <Button
                variant="light"
                size="xs"
                color="orange"
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
