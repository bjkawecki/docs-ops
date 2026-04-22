import { Box, Menu, Text, Stack, Badge, ScrollArea, Loader, ActionIcon } from '@mantine/core';
import { IconBug } from '@tabler/icons-react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { AdminUser } from './appShellNavUtils.js';

type Props = {
  show: boolean;
  adminUsersLoading: boolean;
  adminUsersError: boolean;
  adminUsers: AdminUser[] | undefined;
  impersonateMutation: UseMutationResult<void, Error, string, unknown>;
};

export function AppShellDebugMenu({
  show,
  adminUsersLoading,
  adminUsersError,
  adminUsers,
  impersonateMutation,
}: Props) {
  if (!show) return null;

  return (
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
          ) : (adminUsers ?? []).length === 0 ? (
            <Menu.Item disabled>
              <Text size="sm" c="dimmed">
                No users available.
              </Text>
            </Menu.Item>
          ) : (
            <ScrollArea.Autosize mah={320}>
              {(adminUsers ?? []).map((u) => (
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
  );
}
