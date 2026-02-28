import { Link, Outlet, useNavigate } from 'react-router-dom';
import { AppShell as MantineAppShell, Group, Button, Title, Anchor, Stack } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

export function AppShell() {
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error('Logout fehlgeschlagen');
    },
    onSuccess: () => navigate('/login', { replace: true }),
  });

  return (
    <MantineAppShell header={{ height: 56 }} navbar={{ width: 220, breakpoint: 'sm' }} padding="md">
      <MantineAppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={4}>DocsOps</Title>
          <Button
            variant="subtle"
            size="xs"
            onClick={() => logout.mutate()}
            loading={logout.isPending}
          >
            Abmelden
          </Button>
        </Group>
      </MantineAppShell.Header>
      <MantineAppShell.Navbar p="md">
        <MantineAppShell.Section>
          <Stack gap="xs">
            <Anchor component={Link} to="/" size="sm">
              Home
            </Anchor>
            <Anchor component={Link} to="/teams" size="sm">
              Teams
            </Anchor>
            <Anchor component={Link} to="/repositories" size="sm">
              Repositories
            </Anchor>
            <Anchor component={Link} to="/prozesse" size="sm">
              Prozesse
            </Anchor>
            <Anchor component={Link} to="/firma" size="sm">
              Firma
            </Anchor>
            <Anchor component={Link} to="/templates" size="sm">
              Templates
            </Anchor>
          </Stack>
        </MantineAppShell.Section>
      </MantineAppShell.Navbar>
      <MantineAppShell.Main>
        <Outlet />
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
