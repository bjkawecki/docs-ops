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
} from '@tabler/icons-react';
import { apiFetch } from '../api/client';
import { useMe, meQueryKey } from '../hooks/useMe';
import { DocopsLogo } from './DocopsLogo';

function isActive(path: string, current: string): boolean {
  if (path === '/') return current === '/';
  return current === path || current.startsWith(path + '/');
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
};

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedDepartmentIds, setExpandedDepartmentIds] = useState<Set<string>>(new Set());
  const [impersonateModalOpen, setImpersonateModalOpen] = useState(false);
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
      notifications.show({ title: 'Impersonation beendet', color: 'green' });
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
            to="/teams"
            label="Team"
            active={isActive('/teams', location.pathname)}
          />
          <NavLink
            component={Link}
            to="/department"
            label="Department"
            active={isActive('/department', location.pathname)}
          />
          <NavLink
            component={Link}
            to="/company"
            label="Company"
            active={isActive('/company', location.pathname)}
          />
        </>
      );
    }

    if ((isCompanyLead || isAdmin) && companyDepartments?.items) {
      return (
        <>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt="xs" mb={4}>
            Departments
          </Text>
          {companyDepartments.items.map((dept) => {
            const isExpanded = expandedDepartmentIds.has(dept.id);
            return (
              <Box key={dept.id}>
                <Group gap={0} wrap="nowrap" style={{ alignItems: 'stretch' }}>
                  <UnstyledButton
                    style={{ flex: 0, padding: '2px 4px' }}
                    onClick={() =>
                      setExpandedDepartmentIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(dept.id)) next.delete(dept.id);
                        else next.add(dept.id);
                        return next;
                      })
                    }
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? (
                      <IconChevronDown size={16} style={{ display: 'block' }} />
                    ) : (
                      <IconChevronRight size={16} style={{ display: 'block' }} />
                    )}
                  </UnstyledButton>
                  <NavLink
                    component={Link}
                    to={`/department/${dept.id}`}
                    label={dept.name}
                    active={isActive(`/department/${dept.id}`, location.pathname)}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </Group>
                <Collapse in={isExpanded}>
                  <Stack gap={0} pl="xl">
                    {(dept.teams ?? []).map((team) => (
                      <NavLink
                        key={team.id}
                        component={Link}
                        to={`/teams/${team.id}`}
                        label={team.name}
                        active={location.pathname === `/teams/${team.id}`}
                      />
                    ))}
                  </Stack>
                </Collapse>
              </Box>
            );
          })}
          <NavLink
            component={Link}
            to="/company"
            label="Company"
            active={isActive('/company', location.pathname)}
          />
        </>
      );
    }

    if (isDepartmentLead && departmentId && departmentTeams?.items) {
      const dept = me.identity.departmentLeads[0];
      return (
        <>
          <NavLink
            component={Link}
            to={`/department/${departmentId}`}
            label={dept?.name ?? 'Department'}
            active={isActive(`/department/${departmentId}`, location.pathname)}
          />
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt="xs" mb={4}>
            Teams
          </Text>
          {departmentTeams.items.map((team) => (
            <NavLink
              key={team.id}
              component={Link}
              to={`/teams/${team.id}`}
              label={team.name}
              active={location.pathname === `/teams/${team.id}`}
            />
          ))}
          <NavLink
            component={Link}
            to="/company"
            label="Company"
            active={isActive('/company', location.pathname)}
          />
        </>
      );
    }

    const teams = me.identity.teams ?? [];
    return (
      <>
        <NavLink
          component={Link}
          to="/teams"
          label="Team"
          active={isActive('/teams', location.pathname)}
        />
        {teams.length > 0 &&
          teams.map((t) => (
            <NavLink
              key={t.teamId}
              component={Link}
              to={`/teams/${t.teamId}`}
              label={t.teamName}
              active={location.pathname === `/teams/${t.teamId}`}
              pl="md"
            />
          ))}
        <NavLink
          component={Link}
          to="/company"
          label="Company"
          active={isActive('/company', location.pathname)}
        />
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
            <MantineAppShell.Section mb="md">
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
            </MantineAppShell.Section>
            <MantineAppShell.Section>
              <Stack gap={4}>
                <NavLink
                  component={Link}
                  to="/"
                  label="Home"
                  active={isActive('/', location.pathname)}
                />
                <NavLink
                  component={Link}
                  to="/catalog"
                  label="Catalog"
                  active={isActive('/catalog', location.pathname)}
                />
                {renderRoleBasedNav()}
                <NavLink
                  component={Link}
                  to="/personal"
                  label="Personal"
                  active={isActive('/personal', location.pathname)}
                />
                <NavLink
                  component={Link}
                  to="/shared"
                  label="Shared"
                  active={isActive('/shared', location.pathname)}
                />
              </Stack>
            </MantineAppShell.Section>
          </Box>
          <MantineAppShell.Section>
            <Menu position="top-end" shadow="md" width={200}>
              <Menu.Target>
                <NavLink
                  label={me?.user?.email ?? me?.user?.name ?? 'Account'}
                  rightSection={<IconChevronDown size={14} />}
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
              <Text size="sm">
                Ansicht als <strong>{me.user.name}</strong>
                {me.user.email ? ` (${me.user.email})` : ''}. Du bist{' '}
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
