import { Box, Button, Group, Text } from '@mantine/core';
import type { UseMutationResult } from '@tanstack/react-query';
import type { MeResponse } from '../../api/me-types.js';
import { getDisplayRole } from './appShellNavUtils.js';

type Props = {
  me: MeResponse | undefined;
  resolvedColorScheme: 'light' | 'dark';
  stopImpersonateMutation: UseMutationResult<void, Error, void, unknown>;
};

export function AppShellImpersonationBanner({
  me,
  resolvedColorScheme,
  stopImpersonateMutation,
}: Props) {
  if (!me?.impersonation?.active) return null;

  return (
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
        border:
          resolvedColorScheme === 'dark'
            ? '1px solid var(--mantine-color-dark-5)'
            : '1px solid var(--mantine-color-yellow-4)',
      }}
      bg={resolvedColorScheme === 'dark' ? 'dark.6' : 'yellow.2'}
    >
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" c={resolvedColorScheme === 'dark' ? 'gray.3' : 'dark.7'}>
          Viewing as <strong>{me.user.name}</strong>
          {me.user.email ? ` (${me.user.email})` : ''}, {getDisplayRole(me)}. You are{' '}
          {me.impersonation.realUser.name}.
        </Text>
        <Button
          variant="filled"
          size="xs"
          color="grape"
          onClick={() => stopImpersonateMutation.mutate()}
          disabled={stopImpersonateMutation.isPending}
        >
          End
        </Button>
      </Group>
    </Box>
  );
}
