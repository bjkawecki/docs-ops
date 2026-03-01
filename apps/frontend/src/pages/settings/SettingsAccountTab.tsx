import {
  Box,
  Card,
  Stack,
  Text,
  Button,
  TextInput,
  PasswordInput,
  Group,
  Modal,
  Grid,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useState, useEffect } from 'react';
import { apiFetch } from '../../api/client';
import type { MeResponse } from '../../api/me-types';

const MIN_PASSWORD_LENGTH = 8;

export function SettingsAccountTab() {
  const queryClient = useQueryClient();
  const [changeEmailOpened, { open: openChangeEmail, close: closeChangeEmail }] =
    useDisclosure(false);
  const [changePasswordOpened, { open: openChangePassword, close: closeChangePassword }] =
    useDisclosure(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<MeResponse> => {
      const res = await apiFetch('/api/v1/me');
      if (!res.ok) throw new Error('Failed to load profile');
      return res.json();
    },
  });

  useEffect(() => {
    if (changeEmailOpened && data) {
      setNewEmail(data.user.email ?? '');
    }
  }, [changeEmailOpened, data]);

  const patchAccount = useMutation({
    mutationFn: async (body: {
      email?: string | null;
      currentPassword?: string;
      newPassword?: string;
    }) => {
      const res = await apiFetch('/api/v1/me/account', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      if (variables.newPassword !== undefined) {
        notifications.show({
          title: 'Password updated',
          message: 'Your password has been changed.',
          color: 'green',
        });
        closeChangePassword();
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
      if (variables.email !== undefined) {
        notifications.show({
          title: 'Email updated',
          message: 'Your email has been updated.',
          color: 'green',
        });
        closeChangeEmail();
        setNewEmail('');
        setCurrentPassword('');
      }
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Update failed', message: err.message, color: 'red' });
    },
  });

  const handleSubmitChangeEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    patchAccount.mutate({ email: newEmail.trim(), currentPassword });
  };

  const handleSubmitChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      notifications.show({
        title: 'Passwords do not match',
        message: 'Please confirm your new password.',
        color: 'red',
      });
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      notifications.show({
        title: 'Password too short',
        message: `At least ${MIN_PASSWORD_LENGTH} characters required.`,
        color: 'red',
      });
      return;
    }
    patchAccount.mutate({ currentPassword, newPassword });
  };

  if (isPending || !data) {
    return (
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          Loading…
        </Text>
      </Card>
    );
  }
  if (isError) {
    return (
      <Card withBorder padding="md">
        <Text size="sm" c="red">
          {error?.message}
        </Text>
      </Card>
    );
  }

  const { user } = data;
  const hasLocalLogin = user.hasLocalLogin ?? false;

  return (
    <>
      <Grid gutter="md">
        {/* Card: Email */}
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Card withBorder padding={0} h="100%">
            <Box py="sm" px="md" bg="var(--mantine-color-default-hover)">
              <Text fw={600} size="md">
                Email
              </Text>
            </Box>
            <Box p="lg">
              <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xl">
                <Stack gap="sm">
                  <Text size="sm" fw={500} style={{ fontFamily: 'monospace' }}>
                    {hasLocalLogin ? (user.email ?? '—') : '—'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {hasLocalLogin
                      ? 'Your login email. You need your current password to change it.'
                      : 'Managed by SSO. Cannot be changed here.'}
                  </Text>
                </Stack>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={openChangeEmail}
                  disabled={!hasLocalLogin}
                >
                  Change email
                </Button>
              </Group>
            </Box>
          </Card>
        </Grid.Col>

        {/* Card: Password */}
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Card withBorder padding={0} h="100%">
            <Box py="sm" px="md" bg="var(--mantine-color-default-hover)">
              <Text fw={600} size="md">
                Password
              </Text>
            </Box>
            <Box p="lg">
              <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xl">
                <Stack gap="sm">
                  <Text size="sm" fw={500} style={{ fontFamily: 'monospace', letterSpacing: 2 }}>
                    {hasLocalLogin ? '**********' : '—'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {hasLocalLogin
                      ? 'Change your password. You will need your current password.'
                      : 'Managed by SSO. Cannot be changed here.'}
                  </Text>
                </Stack>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={openChangePassword}
                  disabled={!hasLocalLogin}
                >
                  Change password
                </Button>
              </Group>
            </Box>
          </Card>
        </Grid.Col>
      </Grid>

      <Modal opened={changeEmailOpened} onClose={closeChangeEmail} title="Change email">
        <form onSubmit={handleSubmitChangeEmail}>
          <Stack gap="md">
            <TextInput
              label="New email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.currentTarget.value)}
              required
              placeholder="you@example.com"
            />
            <PasswordInput
              label="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.currentTarget.value)}
              required
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeChangeEmail}>
                Cancel
              </Button>
              <Button type="submit" loading={patchAccount.isPending}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={changePasswordOpened} onClose={closeChangePassword} title="Change password">
        <form onSubmit={handleSubmitChangePassword}>
          <Stack gap="md">
            <PasswordInput
              label="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.currentTarget.value)}
              required
            />
            <PasswordInput
              label="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.currentTarget.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              description={`At least ${MIN_PASSWORD_LENGTH} characters`}
            />
            <PasswordInput
              label="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.currentTarget.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={closeChangePassword}>
                Cancel
              </Button>
              <Button type="submit" loading={patchAccount.isPending}>
                Save
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
