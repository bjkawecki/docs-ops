import { Link } from 'react-router-dom';
import { Box, Divider, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core';
import {
  IconChevronDown,
  IconHelp,
  IconLogout,
  IconSettings,
  IconShield,
} from '@tabler/icons-react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { MeResponse } from '../../api/me-types.js';

type Props = {
  me: MeResponse | undefined;
  accountMenuOpen: boolean;
  setAccountMenuOpen: (open: boolean) => void;
  logout: UseMutationResult<void, Error, void, unknown>;
};

export function AppShellAccountMenu({ me, accountMenuOpen, setAccountMenuOpen, logout }: Props) {
  return (
    <>
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
            <Menu.Item component={Link} to="/admin/users" leftSection={<IconShield size={14} />}>
              Admin
            </Menu.Item>
          )}
          <Menu.Item component={Link} to="/help/overview" leftSection={<IconHelp size={14} />}>
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
    </>
  );
}
