import { Alert, Box, Button, Group, MultiSelect, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';
import type { MeResponse } from '../../api/me-types';

type DocumentScope =
  | { type: 'personal'; name?: string | null }
  | { type: 'company'; id: string; name?: string | null }
  | { type: 'department'; id: string; name?: string | null }
  | { type: 'team'; id: string; name?: string | null };

type GrantsResponse = {
  users: { userId: string; role: 'Read' | 'Write' }[];
  teams: { teamId: string; role: 'Read' | 'Write' }[];
  departments: { departmentId: string; role: 'Read' | 'Write' }[];
};

type Props = {
  documentId: string;
  scope: DocumentScope | null;
  me: MeResponse | undefined;
  canEditAccess: boolean;
};

function sorted(list: string[]): string[] {
  return [...list].sort((a, b) => a.localeCompare(b));
}

export function DocumentAccessPanel({ documentId, scope, me, canEditAccess }: Props) {
  const queryClient = useQueryClient();
  const [userWriteIds, setUserWriteIds] = useState<string[]>([]);
  const [teamWriteIds, setTeamWriteIds] = useState<string[]>([]);
  const [departmentWriteIds, setDepartmentWriteIds] = useState<string[]>([]);
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

  const departmentsQuery = useQuery({
    queryKey: [
      'document',
      documentId,
      'access',
      'departments',
      scope?.type,
      scope?.type !== 'personal' ? (scope as { id?: string })?.id : null,
    ],
    queryFn: async () => {
      if (!scope)
        return [] as { id: string; name: string; teams?: { id: string; name: string }[] }[];
      if (scope.type === 'company') {
        const res = await apiFetch(`/api/v1/companies/${scope.id}/departments?limit=200`);
        if (!res.ok) throw new Error('Failed to load departments.');
        const body = (await res.json()) as {
          items: { id: string; name: string; teams?: { id: string; name: string }[] }[];
        };
        return body.items;
      }
      if (scope.type === 'department') {
        return [{ id: scope.id, name: scope.name ?? 'Department', teams: [] }];
      }
      if (scope.type === 'team') {
        const found = me?.identity.teams.find((t) => t.teamId === scope.id);
        if (!found) return [];
        return [{ id: found.departmentId, name: found.departmentName, teams: [] }];
      }
      return [];
    },
    enabled: !!documentId && !!scope && scope.type !== 'personal',
  });

  const teamsQuery = useQuery({
    queryKey: [
      'document',
      documentId,
      'access',
      'teams',
      scope?.type,
      scope?.type !== 'personal' ? (scope as { id?: string })?.id : null,
    ],
    queryFn: async () => {
      if (!scope) return [] as { id: string; name: string }[];
      if (scope.type === 'company') {
        const depts = departmentsQuery.data ?? [];
        return depts.flatMap((d) => d.teams ?? []);
      }
      if (scope.type === 'department') {
        const res = await apiFetch(`/api/v1/departments/${scope.id}/teams?limit=200`);
        if (!res.ok) throw new Error('Failed to load teams.');
        const body = (await res.json()) as { items: { id: string; name: string }[] };
        return body.items;
      }
      if (scope.type === 'team') {
        return [{ id: scope.id, name: scope.name ?? 'Team' }];
      }
      return [];
    },
    enabled: !!documentId && !!scope && scope.type !== 'personal',
  });

  const userOptionsQuery = useQuery({
    queryKey: ['document', documentId, 'access', 'users', me?.user.isAdmin === true],
    queryFn: async () => {
      if (me?.user.isAdmin) {
        const res = await apiFetch('/api/v1/admin/users?limit=200&includeDeactivated=false');
        if (!res.ok) throw new Error('Failed to load users.');
        const body = (await res.json()) as { items: { id: string; name: string }[] };
        return body.items;
      }
      const grants = grantsQuery.data;
      if (!grants) return [] as { id: string; name: string }[];
      return grants.users.map((g) => ({ id: g.userId, name: g.userId }));
    },
    enabled: !!documentId && grantsQuery.isSuccess,
  });

  useEffect(() => {
    const grants = grantsQuery.data;
    if (!grants) return;
    setUserWriteIds(sorted(grants.users.filter((g) => g.role === 'Write').map((g) => g.userId)));
    setTeamWriteIds(sorted(grants.teams.filter((g) => g.role === 'Write').map((g) => g.teamId)));
    setDepartmentWriteIds(
      sorted(grants.departments.filter((g) => g.role === 'Write').map((g) => g.departmentId))
    );
  }, [grantsQuery.data]);

  const userOptions = useMemo(
    () => (userOptionsQuery.data ?? []).map((u) => ({ value: u.id, label: u.name })),
    [userOptionsQuery.data]
  );
  const teamOptions = useMemo(
    () => (teamsQuery.data ?? []).map((t) => ({ value: t.id, label: t.name })),
    [teamsQuery.data]
  );
  const departmentOptions = useMemo(
    () => (departmentsQuery.data ?? []).map((d) => ({ value: d.id, label: d.name })),
    [departmentsQuery.data]
  );

  const dirty = useMemo(() => {
    const grants = grantsQuery.data;
    if (!grants) return false;
    const usersServer = sorted(grants.users.filter((g) => g.role === 'Write').map((g) => g.userId));
    const teamsServer = sorted(grants.teams.filter((g) => g.role === 'Write').map((g) => g.teamId));
    const departmentsServer = sorted(
      grants.departments.filter((g) => g.role === 'Write').map((g) => g.departmentId)
    );
    return (
      JSON.stringify(usersServer) !== JSON.stringify(sorted(userWriteIds)) ||
      JSON.stringify(teamsServer) !== JSON.stringify(sorted(teamWriteIds)) ||
      JSON.stringify(departmentsServer) !== JSON.stringify(sorted(departmentWriteIds))
    );
  }, [departmentWriteIds, grantsQuery.data, teamWriteIds, userWriteIds]);

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
        grants: [
          ...sorted([...new Set(teamRead)]).map((teamId) => ({ teamId, role: 'Read' as const })),
          ...sorted([...new Set(teamWriteIds)]).map((teamId) => ({
            teamId,
            role: 'Write' as const,
          })),
        ],
      };
      const departmentPayload = {
        grants: [
          ...sorted([...new Set(departmentRead)]).map((departmentId) => ({
            departmentId,
            role: 'Read' as const,
          })),
          ...sorted([...new Set(departmentWriteIds)]).map((departmentId) => ({
            departmentId,
            role: 'Write' as const,
          })),
        ],
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

      <Box>
        <MultiSelect
          label="User write access"
          placeholder={
            me?.user.isAdmin
              ? 'Select users with write access'
              : 'Only existing user grants are visible'
          }
          data={userOptions}
          value={userWriteIds}
          onChange={setUserWriteIds}
          searchable
          clearable
          disabled={!canEditAccess || userOptions.length === 0}
        />
      </Box>

      <Box>
        <MultiSelect
          label="Team write access"
          placeholder="Select teams with write access"
          data={teamOptions}
          value={teamWriteIds}
          onChange={setTeamWriteIds}
          searchable
          clearable
          disabled={!canEditAccess || teamOptions.length === 0}
        />
      </Box>

      <Box>
        <MultiSelect
          label="Department write access"
          placeholder="Select departments with write access"
          data={departmentOptions}
          value={departmentWriteIds}
          onChange={setDepartmentWriteIds}
          searchable
          clearable
          disabled={!canEditAccess || departmentOptions.length === 0}
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
