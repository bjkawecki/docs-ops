import { Box, Card, Stack, Text, Table, Button, Badge, Grid } from '@mantine/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';

type SessionItem = { id: string; createdAt: string; expiresAt: string; isCurrent: boolean };

export function SettingsSecurityTab() {
  const queryClient = useQueryClient();

  const { data: sessionsData } = useQuery({
    queryKey: ['me', 'sessions'],
    queryFn: async (): Promise<{ sessions: SessionItem[] }> => {
      const res = await apiFetch('/api/v1/me/sessions');
      if (!res.ok) throw new Error('Failed to load sessions');
      return res.json();
    },
  });

  const revokeSession = useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string; isCurrent: boolean }) => {
      const res = await apiFetch(`/api/v1/me/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
    },
    onSuccess: (_, { isCurrent }) => {
      queryClient.invalidateQueries({ queryKey: ['me', 'sessions'] });
      if (isCurrent) {
        notifications.show({
          title: 'Session ended',
          message: 'You have been logged out.',
          color: 'green',
        });
        apiFetch('/api/v1/auth/logout', { method: 'POST' }).then(() => {
          window.location.href = '/login';
        });
      } else {
        notifications.show({
          title: 'Session revoked',
          message: 'The session has been ended.',
          color: 'green',
        });
      }
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Revoke failed', message: err.message, color: 'red' });
    },
  });

  const revokeAllOtherSessions = useMutation({
    mutationFn: async () => {
      const res = await apiFetch('/api/v1/me/sessions', { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'sessions'] });
      notifications.show({
        title: 'Sessions ended',
        message: 'All other sessions have been revoked.',
        color: 'green',
      });
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Revoke failed', message: err.message, color: 'red' });
    },
  });

  return (
    <Grid gutter="md">
      <Grid.Col span={{ base: 12, sm: 12 }}>
        <Card withBorder padding={0} h="100%">
          <Box py="xs" px="md" bg="var(--mantine-color-default-hover)">
            <Text fw={600} size="md">
              Sessions
            </Text>
          </Box>
          <Box p="md">
            <Text size="xs" c="dimmed" mb="md">
              Active sessions. Revoke others to log them out.
            </Text>
            {sessionsData?.sessions && sessionsData.sessions.length > 0 ? (
              <Stack gap="md">
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Created</Table.Th>
                      <Table.Th>Expires</Table.Th>
                      <Table.Th></Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {sessionsData.sessions.map((s) => (
                      <Table.Tr key={s.id}>
                        <Table.Td>
                          <Text size="sm">{new Date(s.createdAt).toLocaleString()}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{new Date(s.expiresAt).toLocaleString()}</Text>
                        </Table.Td>
                        <Table.Td>
                          {s.isCurrent ? (
                            <Badge size="sm" variant="light">
                              Current session
                            </Badge>
                          ) : (
                            <Button
                              variant="subtle"
                              size="xs"
                              color="red"
                              onClick={() =>
                                revokeSession.mutate({ sessionId: s.id, isCurrent: false })
                              }
                              loading={revokeSession.isPending}
                            >
                              Revoke
                            </Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
                {sessionsData.sessions.some((s) => !s.isCurrent) ? (
                  <Button
                    variant="light"
                    size="xs"
                    color="red"
                    onClick={() => revokeAllOtherSessions.mutate()}
                    loading={revokeAllOtherSessions.isPending}
                  >
                    Revoke all other sessions
                  </Button>
                ) : null}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                No sessions.
              </Text>
            )}
          </Box>
        </Card>
      </Grid.Col>
    </Grid>
  );
}
