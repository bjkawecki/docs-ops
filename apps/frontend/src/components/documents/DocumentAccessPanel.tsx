import { Alert, Box, Button, Group, MultiSelect, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';

type GrantsResponse = {
  users: { userId: string; role: 'Read' | 'Write' }[];
  teams: { teamId: string; role: 'Read' | 'Write' }[];
  departments: { departmentId: string; role: 'Read' | 'Write' }[];
};

type CandidateUsersResponse = {
  items: { id: string; name: string; email: string | null }[];
};

type Props = {
  documentId: string;
  canEditAccess: boolean;
};

function sorted(list: string[]): string[] {
  return [...list].sort((a, b) => a.localeCompare(b));
}

export function DocumentAccessPanel({ documentId, canEditAccess }: Props) {
  const queryClient = useQueryClient();
  const [userWriteIds, setUserWriteIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const grantsQuery = useQuery({
    queryKey: ['document', documentId, 'grants'],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/documents/${documentId}/grants`);
      if (!res.ok) throw new Error('Failed to load document access.');
      return (await res.json()) as GrantsResponse;
    },
    enabled: !!documentId,
  });

  const userOptionsQuery = useQuery<CandidateUsersResponse>({
    queryKey: ['document', documentId, 'access', 'users'],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/documents/${documentId}/grants/candidate-users`);
      if (!res.ok) throw new Error('Failed to load users.');
      return (await res.json()) as CandidateUsersResponse;
    },
    enabled: !!documentId,
  });

  const userOptions = useMemo(
    () =>
      (userOptionsQuery.data?.items ?? []).map((u) => ({
        value: u.id,
        label: u.email ? `${u.name} (${u.email})` : u.name,
      })),
    [userOptionsQuery.data]
  );
  const candidateUserIdSet = useMemo(
    () => new Set((userOptionsQuery.data?.items ?? []).map((u) => u.id)),
    [userOptionsQuery.data]
  );
  const filterToCandidates = useCallback(
    (userIds: string[]) => {
      if (candidateUserIdSet.size === 0) return userIds;
      return userIds.filter((id) => candidateUserIdSet.has(id));
    },
    [candidateUserIdSet]
  );

  useEffect(() => {
    const grants = grantsQuery.data;
    if (!grants) return;
    const writeIds = grants.users.filter((g) => g.role === 'Write').map((g) => g.userId);
    setUserWriteIds(sorted(filterToCandidates(writeIds)));
  }, [grantsQuery.data, filterToCandidates]);

  const dirty = useMemo(() => {
    const grants = grantsQuery.data;
    if (!grants) return false;
    const usersServer = sorted(
      filterToCandidates(grants.users.filter((g) => g.role === 'Write').map((g) => g.userId))
    );
    return JSON.stringify(usersServer) !== JSON.stringify(sorted(userWriteIds));
  }, [grantsQuery.data, userWriteIds, filterToCandidates]);

  const save = async () => {
    if (!canEditAccess) return;
    const grants = grantsQuery.data;
    if (!grants) return;
    setSaving(true);
    try {
      const userRead = grants.users.filter((g) => g.role === 'Read').map((g) => g.userId);
      const teamRead = grants.teams.filter((g) => g.role === 'Read').map((g) => g.teamId);
      const departmentRead = grants.departments
        .filter((g) => g.role === 'Read')
        .map((g) => g.departmentId);

      const userPayload = {
        grants: [
          ...sorted([...new Set(userRead)]).map((userId) => ({ userId, role: 'Read' as const })),
          ...sorted([...new Set(userWriteIds)]).map((userId) => ({
            userId,
            role: 'Write' as const,
          })),
        ],
      };
      const teamPayload = {
        grants: sorted([...new Set(teamRead)]).map((teamId) => ({ teamId, role: 'Read' as const })),
      };
      const departmentPayload = {
        grants: sorted([...new Set(departmentRead)]).map((departmentId) => ({
          departmentId,
          role: 'Read' as const,
        })),
      };

      const [ru, rt, rd] = await Promise.all([
        apiFetch(`/api/v1/documents/${documentId}/grants/users`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userPayload),
        }),
        apiFetch(`/api/v1/documents/${documentId}/grants/teams`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(teamPayload),
        }),
        apiFetch(`/api/v1/documents/${documentId}/grants/departments`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(departmentPayload),
        }),
      ]);
      if (!ru.ok || !rt.ok || !rd.ok) {
        throw new Error('Failed to persist access settings.');
      }

      await queryClient.invalidateQueries({ queryKey: ['document', documentId, 'grants'] });
      await queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      notifications.show({
        color: 'green',
        message: 'Access rules updated.',
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        message: error instanceof Error ? error.message : 'Could not update access rules.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (grantsQuery.isPending) {
    return (
      <Text size="sm" c="dimmed">
        Loading access rules...
      </Text>
    );
  }
  if (grantsQuery.isError || !grantsQuery.data) {
    return (
      <Alert color="red" title="Error">
        Access rules could not be loaded.
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {!canEditAccess && (
        <Alert color="gray" variant="light" title="Read-only">
          You can review access settings but cannot modify them.
        </Alert>
      )}

      {userOptionsQuery.isError && (
        <Alert color="yellow" variant="light" title="User list unavailable">
          Eligible scope users could not be loaded.
        </Alert>
      )}

      {canEditAccess &&
        userOptions.length === 0 &&
        !userOptionsQuery.isPending &&
        !userOptionsQuery.isError && (
          <Alert color="yellow" variant="light" title="No eligible users found">
            No scope users with read access are currently available for write assignment.
          </Alert>
        )}

      <Box>
        <MultiSelect
          label="User write access"
          placeholder={
            canEditAccess ? 'Select users with write access' : 'Write access is read-only'
          }
          data={userOptions}
          value={userWriteIds}
          onChange={setUserWriteIds}
          searchable
          clearable
          disabled={!canEditAccess || userOptionsQuery.isPending || userOptions.length === 0}
          nothingFoundMessage="No matching users"
        />
      </Box>

      <Group justify="flex-end">
        <Button disabled={!canEditAccess || !dirty} loading={saving} onClick={() => void save()}>
          Save access
        </Button>
      </Group>
    </Stack>
  );
}
