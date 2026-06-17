import { Link } from 'react-router-dom';
import {
  Avatar,
  Box,
  Divider,
  Group,
  Menu,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
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
  isMiniRail?: boolean;
};

function accountInitials(name: string | undefined): string {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function AppShellAccountMenu({
  me,
  accountMenuOpen,
  setAccountMenuOpen,
  logout,
  isMiniRail = false,
}: Props) {
  const displayName = me?.user?.name ?? 'Account';

  const trigger = (
    <UnstyledButton
      data-user-menu-trigger
      aria-haspopup="menu"
      aria-expanded={accountMenuOpen}
      aria-label={isMiniRail ? `Account menu, ${displayName}` : undefined}
      className={isMiniRail ? 'app-shell-sidebar-mini-trigger' : undefined}
      style={{
        display: 'block',
        width: isMiniRail ? undefined : '100%',
        cursor: 'pointer',
        padding: isMiniRail ? 0 : 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
        borderRadius: 'var(--mantine-radius-sm)',
      }}
    >
      {isMiniRail ? (
        <Avatar size={32} radius="xl" color="var(--mantine-primary-color-filled)">
          {accountInitials(me?.user?.name)}
        </Avatar>
      ) : (
        <Group justify="space-between" wrap="nowrap" align="center" gap="xs">
          <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" truncate>
              {displayName}
            </Text>
            {me?.user?.email && (
              <Text size="xs" c="dimmed" truncate>
                {me.user.email}
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
      )}
    </UnstyledButton>
  );

  return (
    <>
      <Divider my="sm" />
      <Menu
        position={isMiniRail ? 'right-end' : 'top-end'}
        shadow="md"
        width={200}
        opened={accountMenuOpen}
        onChange={setAccountMenuOpen}
      >
        <Menu.Target>
          {isMiniRail ? (
            <Tooltip label="Account" position="right" withArrow>
              {trigger}
            </Tooltip>
          ) : (
            trigger
          )}
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
