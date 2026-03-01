import { useState, useMemo } from 'react';
import {
  Box,
  Select,
  Stack,
  Title,
  Card,
  Group,
  Button,
  Text,
  Loader,
  Alert,
  List,
  ActionIcon,
  Modal,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconPencil, IconTrash } from '@tabler/icons-react';
import { apiFetch } from '../../api/client';
import type { Company, Department, Team } from 'backend/api-types';

type DepartmentsRes = {
  items: (Department & { teams: Team[] })[];
  total: number;
  limit: number;
  offset: number;
};
type CompaniesRes = { items: Company[]; total: number; limit: number; offset: number };
type AssignmentItem = { id: string; name: string };
type AssignmentListRes = { items: AssignmentItem[]; total: number; limit: number; offset: number };
type AdminUsersRes = { items: { id: string; name: string; email: string | null }[]; total: number };

export function AdminTeamsTab() {
  const queryClient = useQueryClient();
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

  const [addMembersOpened, setAddMembersOpened] = useState(false);
  const [addLeadersOpened, setAddLeadersOpened] = useState(false);
  const [createTeamOpened, { open: openCreateTeam, close: closeCreateTeam }] = useDisclosure(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  const { data: companiesData } = useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<CompaniesRes> => {
      const res = await apiFetch('/api/v1/companies?limit=100');
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
  });

  const companyId = companiesData?.items?.[0]?.id ?? null;

  const { data: departmentsData, isPending: departmentsPending } = useQuery({
    queryKey: ['companies', companyId, 'departments'],
    queryFn: async (): Promise<DepartmentsRes> => {
      const res = await apiFetch(`/api/v1/companies/${companyId}/departments?limit=100`);
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    enabled: !!companyId,
  });

  const departments = departmentsData?.items ?? [];
  const teams = useMemo(() => {
    if (!departmentId || !departments.length) return [];
    const dept = departments.find((d) => d.id === departmentId);
    return dept?.teams ?? [];
  }, [departmentId, departments]);

  const selectedTeam = teamId ? teams.find((t) => t.id === teamId) : null;

  const { data: membersData, isPending: membersPending } = useQuery({
    queryKey: ['teams', teamId, 'members'],
    queryFn: async (): Promise<AssignmentListRes> => {
      const res = await apiFetch(`/api/v1/teams/${teamId}/members?limit=100`);
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    enabled: !!teamId,
  });

  const { data: leadersData, isPending: leadersPending } = useQuery({
    queryKey: ['teams', teamId, 'leaders'],
    queryFn: async (): Promise<AssignmentListRes> => {
      const res = await apiFetch(`/api/v1/teams/${teamId}/leaders?limit=100`);
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    enabled: !!teamId,
  });

  const invalidateAssignments = () => {
    if (teamId) queryClient.invalidateQueries({ queryKey: ['teams', teamId, 'members'] });
    if (teamId) queryClient.invalidateQueries({ queryKey: ['teams', teamId, 'leaders'] });
  };
  const invalidateDepartments = () => {
    if (companyId)
      queryClient.invalidateQueries({ queryKey: ['companies', companyId, 'departments'] });
  };

  const createTeam = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiFetch(`/api/v1/departments/${departmentId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateDepartments();
      closeCreateTeam();
      notifications.show({ title: 'Team created', color: 'green' });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const updateTeam = useMutation({
    mutationFn: async ({
      teamId: tid,
      name,
      departmentId: did,
    }: {
      teamId: string;
      name: string;
      departmentId: string;
    }) => {
      const res = await apiFetch(`/api/v1/teams/${tid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, departmentId: did }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateDepartments();
      setEditingTeam(null);
      setTeamId(null);
      notifications.show({ title: 'Team updated', color: 'green' });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const deleteTeam = useMutation({
    mutationFn: async (tid: string) => {
      const res = await apiFetch(`/api/v1/teams/${tid}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
    },
    onSuccess: () => {
      invalidateDepartments();
      setTeamId(null);
      notifications.show({ title: 'Team deleted', color: 'green' });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const addMember = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/v1/teams/${teamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
    },
    onSuccess: () => {
      invalidateAssignments();
      setAddMembersOpened(false);
      notifications.show({ title: 'Member added', color: 'green' });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/v1/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
    },
    onSuccess: () => {
      invalidateAssignments();
      notifications.show({ title: 'Member removed', color: 'green' });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const addLeader = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/v1/teams/${teamId}/leaders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
    },
    onSuccess: () => {
      invalidateAssignments();
      setAddLeadersOpened(false);
      notifications.show({ title: 'Team leader added', color: 'green' });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const removeLeader = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/v1/teams/${teamId}/leaders/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
    },
    onSuccess: () => {
      invalidateAssignments();
      notifications.show({ title: 'Team leader removed', color: 'green' });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.name }));
  const teamOptions = teams.map((t) => ({ value: t.id, label: t.name }));

  return (
    <Box>
      <Title order={4} mb="md">
        Team selection
      </Title>
      <Stack gap="sm" mb="xl">
        <Select
          label="Department"
          placeholder="Select department"
          data={departmentOptions}
          value={departmentId}
          onChange={(v) => {
            setDepartmentId(v);
            setTeamId(null);
          }}
          disabled={!companyId}
          loading={departmentsPending}
          clearable
        />
        <Group align="flex-end" gap="sm">
          <Select
            label="Team"
            placeholder="Select team"
            data={teamOptions}
            value={teamId}
            onChange={setTeamId}
            disabled={!departmentId}
            clearable
            style={{ flex: 1 }}
          />
          <Button
            size="sm"
            leftSection={<IconPlus size={14} />}
            disabled={!departmentId}
            onClick={openCreateTeam}
          >
            Create team
          </Button>
        </Group>
      </Stack>

      {selectedTeam && (
        <>
          <Group justify="space-between" align="center" mb="sm">
            <Title order={4}>Team: {selectedTeam.name}</Title>
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPencil size={14} />}
                onClick={() => setEditingTeam(selectedTeam)}
              >
                Edit
              </Button>
              <Button
                size="xs"
                variant="light"
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => {
                  if (window.confirm(`Really delete team "${selectedTeam.name}"?`)) {
                    deleteTeam.mutate(selectedTeam.id);
                  }
                }}
                loading={deleteTeam.isPending}
              >
                Delete
              </Button>
            </Group>
          </Group>
          <Group align="flex-start" wrap="wrap" gap="md">
            <Card withBorder padding="md" w={280}>
              <Group justify="space-between" mb="xs">
                <Text fw={600}>Members</Text>
                <Button
                  size="xs"
                  leftSection={<IconPlus size={12} />}
                  onClick={() => setAddMembersOpened(true)}
                >
                  Add
                </Button>
              </Group>
              {membersPending ? (
                <Loader size="sm" />
              ) : (membersData?.items ?? []).length === 0 ? (
                <Text size="sm" c="dimmed">
                  No members
                </Text>
              ) : (
                <List size="sm">
                  {(membersData?.items ?? []).map((u) => (
                    <List.Item key={u.id}>
                      <Group justify="space-between" gap="xs">
                        <span>{u.name}</span>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={() => removeMember.mutate(u.id)}
                          loading={removeMember.isPending}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </List.Item>
                  ))}
                </List>
              )}
            </Card>
            <Card withBorder padding="md" w={280}>
              <Group justify="space-between" mb="xs">
                <Text fw={600}>Team leaders</Text>
                <Button
                  size="xs"
                  leftSection={<IconPlus size={12} />}
                  onClick={() => setAddLeadersOpened(true)}
                >
                  Add
                </Button>
              </Group>
              {leadersPending ? (
                <Loader size="sm" />
              ) : (leadersData?.items ?? []).length === 0 ? (
                <Text size="sm" c="dimmed">
                  No leaders
                </Text>
              ) : (
                <List size="sm">
                  {(leadersData?.items ?? []).map((u) => (
                    <List.Item key={u.id}>
                      <Group justify="space-between" gap="xs">
                        <span>{u.name}</span>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={() => removeLeader.mutate(u.id)}
                          loading={removeLeader.isPending}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </List.Item>
                  ))}
                </List>
              )}
            </Card>
          </Group>
        </>
      )}

      {!companyId && (
        <Alert color="blue" mt="md">
          No company set up. Create a company in the Organisation tab first.
        </Alert>
      )}
      {companyId && !departmentId && (
        <Alert color="blue" mt="md">
          Select department and team to manage members and team leaders.
        </Alert>
      )}

      <UserPickerModal
        opened={addMembersOpened}
        onClose={() => setAddMembersOpened(false)}
        onSelect={(userId) => addMember.mutate(userId)}
        excludeIds={(membersData?.items ?? []).map((u) => u.id)}
        loading={addMember.isPending}
      />
      <Modal
        opened={addLeadersOpened}
        onClose={() => setAddLeadersOpened(false)}
        title="Add team leader"
        size="sm"
      >
        <Stack>
          {membersPending ? (
            <Loader size="sm" />
          ) : (
            (() => {
              const members = membersData?.items ?? [];
              const leaderIds = new Set((leadersData?.items ?? []).map((u) => u.id));
              const candidates = members.filter((m) => !leaderIds.has(m.id));
              if (candidates.length === 0) {
                return (
                  <Text size="sm" c="dimmed">
                    No members available. Add team members first. Team leaders can only be chosen
                    from members.
                  </Text>
                );
              }
              return (
                <List size="sm">
                  {candidates.map((u) => (
                    <List.Item key={u.id}>
                      <Button
                        variant="subtle"
                        size="xs"
                        fullWidth
                        justify="flex-start"
                        onClick={() => {
                          addLeader.mutate(u.id);
                          setAddLeadersOpened(false);
                        }}
                        loading={addLeader.isPending}
                      >
                        {u.name}
                      </Button>
                    </List.Item>
                  ))}
                </List>
              );
            })()
          )}
        </Stack>
      </Modal>

      <Modal opened={createTeamOpened} onClose={closeCreateTeam} title="Create team" size="sm">
        <CreateTeamForm
          onSubmit={(name) => createTeam.mutate(name)}
          onCancel={closeCreateTeam}
          loading={createTeam.isPending}
        />
      </Modal>
      {editingTeam && (
        <Modal opened onClose={() => setEditingTeam(null)} title="Edit team" size="sm">
          <EditTeamForm
            team={editingTeam}
            departments={departments}
            initialDepartmentId={editingTeam.departmentId}
            onSubmit={(name, departmentId: string) =>
              updateTeam.mutate({ teamId: editingTeam.id, name, departmentId })
            }
            onCancel={() => setEditingTeam(null)}
            loading={updateTeam.isPending}
          />
        </Modal>
      )}
    </Box>
  );
}

function CreateTeamForm({
  onSubmit,
  onCancel,
  loading,
}: {
  onSubmit: (name: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  return (
    <Stack>
      <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSubmit(name)} loading={loading} disabled={!name.trim()}>
          Create
        </Button>
      </Group>
    </Stack>
  );
}

function EditTeamForm({
  team,
  departments,
  initialDepartmentId,
  onSubmit,
  onCancel,
  loading,
}: {
  team: Team;
  departments: (Department & { teams?: Team[] })[];
  initialDepartmentId: string;
  onSubmit: (name: string, departmentId: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState(team.name);
  const [departmentId, setDepartmentId] = useState(initialDepartmentId);
  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.name }));
  return (
    <Stack>
      <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Select
        label="Department"
        data={departmentOptions}
        value={departmentId}
        onChange={(v) => v && setDepartmentId(v)}
        required
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => onSubmit(name, departmentId)}
          loading={loading}
          disabled={!name.trim() || !departmentId}
        >
          Save
        </Button>
      </Group>
    </Stack>
  );
}

function UserPickerModal({
  opened,
  onClose,
  onSelect,
  excludeIds,
  loading,
}: {
  opened: boolean;
  onClose: () => void;
  onSelect: (userId: string) => void;
  excludeIds: string[];
  loading: boolean;
}) {
  const [search, setSearch] = useState('');
  const { data, isPending } = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: async (): Promise<AdminUsersRes> => {
      const params = new URLSearchParams({ limit: '50', includeDeactivated: 'false' });
      if (search.trim()) params.set('search', search.trim());
      const res = await apiFetch(`/api/v1/admin/users?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    enabled: opened,
  });
  const options = (data?.items ?? []).filter((u) => !excludeIds.includes(u.id));

  return (
    <Modal opened={opened} onClose={onClose} title="Select user" size="sm">
      <Stack>
        <TextInput
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        {isPending ? (
          <Loader size="sm" />
        ) : options.length === 0 ? (
          <Text size="sm" c="dimmed">
            {search ? 'No matching users' : 'No more users (all already assigned)'}
          </Text>
        ) : (
          <List size="sm">
            {options.slice(0, 20).map((u) => (
              <List.Item key={u.id}>
                <Button
                  variant="subtle"
                  size="xs"
                  fullWidth
                  justify="flex-start"
                  onClick={() => onSelect(u.id)}
                  loading={loading}
                >
                  {u.name} {u.email ? `(${u.email})` : ''}
                </Button>
              </List.Item>
            ))}
          </List>
        )}
      </Stack>
    </Modal>
  );
}
