import {
  Box,
  Card,
  Stack,
  Text,
  List,
  TextInput,
  Button,
  Loader,
  Alert,
  Group,
  Grid,
  Modal,
  Menu,
  ActionIcon,
  SegmentedControl,
  Switch,
  Select,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMantineColorScheme } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState, useEffect } from 'react';
import { IconDotsVertical } from '@tabler/icons-react';
import { apiFetch } from '../../api/client';
import { COLOR_SCHEME_STORAGE_KEY } from '../../constants';
import { useMe, meQueryKey } from '../../hooks/useMe';
import type { UserPreferences } from '../../components/ThemeFromPreferences';
import {
  PRIMARY_COLOR_PRESETS,
  PRIMARY_COLOR_PRESET_LABELS,
  type PrimaryColorPreset,
} from '../../theme';

export function SettingsGeneralTab() {
  const queryClient = useQueryClient();
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const [deactivateOpened, { open: openDeactivate, close: closeDeactivate }] = useDisclosure(false);
  const [name, setName] = useState('');
  const { setColorScheme } = useMantineColorScheme();

  const { data, isPending, isError, error } = useMe();

  useEffect(() => {
    if (data) {
      setName(data.user.name);
    }
  }, [data]);

  // Sync Mantine scheme to stored preference when preferences load (fixes selector vs layout mismatch)
  useEffect(() => {
    const preferred = data?.preferences?.theme ?? 'auto';
    setColorScheme(preferred);
  }, [data?.preferences?.theme, setColorScheme]);

  const patchMe = useMutation({
    mutationFn: async (body: { name: string }) => {
      const res = await apiFetch('/api/v1/me', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as { name: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
      notifications.show({
        title: 'Profile updated',
        message: 'Your profile has been saved.',
        color: 'green',
      });
      closeEdit();
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Update failed', message: err.message, color: 'red' });
    },
  });

  const deactivateMe = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/me/deactivate', { method: 'POST' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: async () => {
      closeDeactivate();
      notifications.show({
        title: 'Account deactivated',
        message: 'You have been logged out. An administrator can reactivate your account.',
        color: 'green',
      });
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Deactivation failed', message: err.message, color: 'red' });
    },
  });

  const patchPreferences = useMutation({
    mutationFn: async (body: Partial<UserPreferences>) => {
      const res = await apiFetch('/api/v1/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save preferences');
      return res.json() as Promise<UserPreferences>;
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'preferences'] });
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
      if (variables.theme !== undefined) {
        setColorScheme(variables.theme);
        try {
          window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, variables.theme);
        } catch {
          // ignore localStorage errors (e.g. private mode)
        }
        notifications.show({
          title: 'Theme updated',
          message: `Color scheme set to ${variables.theme}.`,
          color: 'green',
        });
      }
      if (variables.sidebarPinned !== undefined) {
        notifications.show({
          title: 'Sidebar preference saved',
          message: variables.sidebarPinned ? 'Sidebar is pinned.' : 'Sidebar can be collapsed.',
          color: 'green',
        });
      }
      if (variables.primaryColor !== undefined) {
        notifications.show({
          title: 'Primary color updated',
          message: 'Accent color has been updated.',
          color: 'green',
        });
      }
      if (variables.locale !== undefined) {
        notifications.show({
          title: 'Language saved',
          message: 'Your language preference has been updated.',
          color: 'green',
        });
      }
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Save failed', message: err.message, color: 'red' });
    },
  });

  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    patchMe.mutate({ name });
  };

  if (isPending || !data) return <Loader size="sm" />;
  if (isError) {
    return (
      <Alert color="red" title="Error">
        {error?.message}
      </Alert>
    );
  }

  const { user, identity, preferences } = data;
  const theme = preferences?.theme ?? 'auto';
  const sidebarPinned = preferences?.sidebarPinned ?? false;
  const primaryColor: PrimaryColorPreset = preferences?.primaryColor ?? 'blue';
  const locale = preferences?.locale ?? 'en';

  return (
    <>
      <Grid gutter="md">
        {/* Card 1: Profile (Menu: Edit, Deactivate) */}
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Card withBorder padding={0} h="100%">
            <Box py="xs" px="md" bg="var(--mantine-color-default-hover)">
              <Text fw={600} size="md">
                Profile
              </Text>
            </Box>
            <Box p="md">
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2}>
                    <Text size="lg" fw={500}>
                      {user.name}
                    </Text>
                    {user.isAdmin && (
                      <Text size="sm" c="dimmed">
                        Admin User
                      </Text>
                    )}
                  </Stack>
                  <Menu shadow="md" position="bottom-end">
                    <Menu.Target>
                      <ActionIcon variant="subtle" size="md" aria-label="Profile actions">
                        <IconDotsVertical size={18} stroke={3} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item onClick={openEdit}>Edit Profile</Menu.Item>
                      <Menu.Item color="red" onClick={openDeactivate}>
                        Deactivate
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
                {user.email != null && user.email !== '' && (
                  <Text size="sm" c="dimmed">
                    {user.email}
                  </Text>
                )}
              </Stack>
            </Box>
          </Card>
        </Grid.Col>

        {/* Card 2: Appearance */}
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Card withBorder padding={0} h="100%">
            <Box py="xs" px="md" bg="var(--mantine-color-default-hover)">
              <Text fw={600} size="md">
                Appearance
              </Text>
            </Box>
            <Box p="md">
              <Stack gap="lg">
                <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
                  <Stack gap={2}>
                    <Text size="sm" fw={500}>
                      Theme
                    </Text>
                    <Text size="xs" c="dimmed">
                      Change the theme mode.
                    </Text>
                  </Stack>
                  <SegmentedControl
                    value={theme}
                    onChange={(value) =>
                      patchPreferences.mutate({ theme: value as 'light' | 'dark' | 'auto' })
                    }
                    data={[
                      { label: 'Light', value: 'light' },
                      { label: 'Dark', value: 'dark' },
                      { label: 'Auto', value: 'auto' },
                    ]}
                    disabled={patchPreferences.isPending}
                  />
                </Group>
                <Group justify="space-between" align="center" wrap="nowrap" gap="md">
                  <Stack gap={2}>
                    <Text size="sm" fw={500}>
                      Pin sidebar
                    </Text>
                    <Text size="xs" c="dimmed">
                      Prevent the sidebar from collapsing.
                    </Text>
                  </Stack>
                  <Switch
                    checked={sidebarPinned}
                    onChange={(e) =>
                      patchPreferences.mutate({ sidebarPinned: e.currentTarget.checked })
                    }
                    disabled={patchPreferences.isPending}
                  />
                </Group>
                <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
                  <Stack gap={2}>
                    <Text size="sm" fw={500}>
                      Primary color
                    </Text>
                    <Text size="xs" c="dimmed">
                      Accent color for links, tabs, and buttons.
                    </Text>
                  </Stack>
                  <Select
                    value={primaryColor}
                    onChange={(value) => {
                      if (
                        value !== null &&
                        (PRIMARY_COLOR_PRESETS as readonly string[]).includes(value)
                      ) {
                        patchPreferences.mutate({
                          primaryColor: value as PrimaryColorPreset,
                        });
                      }
                    }}
                    data={[...PRIMARY_COLOR_PRESETS]
                      .sort((a, b) =>
                        PRIMARY_COLOR_PRESET_LABELS[a].localeCompare(PRIMARY_COLOR_PRESET_LABELS[b])
                      )
                      .map((preset) => ({
                        label: PRIMARY_COLOR_PRESET_LABELS[preset],
                        value: preset,
                      }))}
                    disabled={patchPreferences.isPending}
                    w={200}
                    styles={{ option: { whiteSpace: 'nowrap' } }}
                  />
                </Group>
                <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
                  <Stack gap={2}>
                    <Text size="sm" fw={500}>
                      Interface language
                    </Text>
                    <Text size="xs" c="dimmed">
                      Language for the user interface.
                    </Text>
                  </Stack>
                  <Select
                    value={locale}
                    onChange={(value) => {
                      if (value === 'en' || value === 'de') {
                        patchPreferences.mutate({ locale: value });
                      }
                    }}
                    data={[
                      { label: 'English', value: 'en' },
                      { label: 'Deutsch', value: 'de' },
                    ]}
                    disabled={patchPreferences.isPending}
                    w={160}
                  />
                </Group>
              </Stack>
            </Box>
          </Card>
        </Grid.Col>

        {/* Card 3: DocsOps Identity */}
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Card withBorder padding={0} h="100%">
            <Box py="xs" px="md" bg="var(--mantine-color-default-hover)">
              <Text fw={600} size="md">
                DocsOps Identity
              </Text>
            </Box>
            <Box p="md">
              <Stack gap="md">
                <div>
                  <Text size="sm" fw={500} mb={4}>
                    User Entity
                  </Text>
                  <Text size="sm" c="dimmed">
                    {user.isAdmin ? 'Admin User' : 'User'}
                  </Text>
                </div>
                <div>
                  <Text size="sm" fw={500} mb={4}>
                    Ownership Entities
                  </Text>
                  {identity.teams.length > 0 ||
                  identity.departmentLeads.length > 0 ||
                  identity.companyLeads?.length > 0 ? (
                    <List size="sm">
                      {identity.teams.map((t) => (
                        <List.Item key={t.teamId}>
                          {t.teamName} ({t.departmentName}) –{' '}
                          {t.role === 'leader' ? 'Team Lead' : 'Member'}
                        </List.Item>
                      ))}
                      {identity.departmentLeads.map((d) => (
                        <List.Item key={d.id}>Department Lead: {d.name}</List.Item>
                      ))}
                      {identity.companyLeads?.map((c) => (
                        <List.Item key={c.id}>Company Lead: {c.name}</List.Item>
                      ))}
                    </List>
                  ) : (
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  )}
                </div>
              </Stack>
            </Box>
          </Card>
        </Grid.Col>
      </Grid>

      <Modal opened={editOpened} onClose={closeEdit} title="Edit profile">
        <form onSubmit={handleSubmitEdit}>
          <Stack gap="md">
            <TextInput
              label="Display name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
              minLength={1}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeEdit}>
                Cancel
              </Button>
              <Button type="submit" loading={patchMe.isPending}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={deactivateOpened} onClose={closeDeactivate} title="Deactivate account">
        <Stack gap="md">
          {user.isAdmin ? (
            <Text size="sm" c="dimmed">
              Administrators cannot deactivate their own account. Please ask another administrator.
            </Text>
          ) : (
            <Text size="sm" c="dimmed">
              Deactivate account? You will not be able to log in until an administrator reactivates
              you.
            </Text>
          )}
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeDeactivate}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deactivateMe.isPending}
              disabled={user.isAdmin}
              onClick={() => !user.isAdmin && deactivateMe.mutate()}
            >
              Deactivate
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
