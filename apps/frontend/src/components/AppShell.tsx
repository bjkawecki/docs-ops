import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AppShell as MantineAppShell, Stack, NavLink, Box, Menu } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconChevronDown, IconLogout, IconSettings, IconShield } from '@tabler/icons-react';
import { apiFetch } from '../api/client';
import type { MeResponse } from '../api/me-types';
import { DocopsLogo } from './DocopsLogo';

function isActive(path: string, current: string): boolean {
  if (path === '/') return current === '/';
  return current === path || current.startsWith(path + '/');
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: me } = useQuery<MeResponse>({ queryKey: ['me'] });
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

  return (
    <MantineAppShell navbar={{ width: 220, breakpoint: 'sm' }} padding="md" header={{ height: 0 }}>
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
                  to="/teams"
                  label="Teams"
                  active={isActive('/teams', location.pathname)}
                />
                <NavLink
                  component={Link}
                  to="/repositories"
                  label="Repositories"
                  active={isActive('/repositories', location.pathname)}
                />
                <NavLink
                  component={Link}
                  to="/processes"
                  label="Processes"
                  active={isActive('/processes', location.pathname)}
                />
                <NavLink
                  component={Link}
                  to="/company"
                  label="Company"
                  active={isActive('/company', location.pathname)}
                />
                <NavLink
                  component={Link}
                  to="/templates"
                  label="Templates"
                  active={isActive('/templates', location.pathname)}
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
        <Outlet />
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
