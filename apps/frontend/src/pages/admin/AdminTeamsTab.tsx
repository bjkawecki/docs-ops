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
  Table,
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

type TeamWithDept = Team & { departmentId: string; departmentName: string };

export function AdminTeamsTab() {
  const queryClient = useQueryClient();
  const [filterText, setFilterText] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

  const [addMembersOpened, setAddMembersOpened] = useState(false);
  const [addLeadersOpened, setAddLeadersOpened] = useState(false);
  const [createTeamOpened, { open: openCreateTeam, close: closeCreateTeam }] = useDisclosure(false);
  const [editingTeam, setEditingTeam] = useState<TeamWithDept | null>(null);
  const [deleteConfirmTeam, setDeleteConfirmTeam] = useState<TeamWithDept | null>(null);

  const { data: companiesData } = useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<CompaniesRes> => {
      const res = await apiFetch('/api/v1/companies?limit=100');
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as CompaniesRes;
    },
  });

  const companyId = companiesData?.items?.[0]?.id ?? null;

  const { data: departmentsData } = useQuery({
    queryKey: ['companies', companyId, 'departments'],
    queryFn: async (): Promise<DepartmentsRes> => {
      const res = await apiFetch(`/api/v1/companies/${companyId}/departments?limit=100`);
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as DepartmentsRes;
    },
    enabled: !!companyId,
  });

  const departments = useMemo(() => departmentsData?.items ?? [], [departmentsData?.items]);

  const allTeams = useMemo(
    (): TeamWithDept[] =>
      departments.flatMap((d) =>
        (d.teams ?? []).map((t) => ({
          ...t,
          departmentId: d.id,
          departmentName: d.name,
        }))
      ),
    [departments]
  );

  const filteredTeams = useMemo(() => {
    let list = allTeams;
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      list = list.filter(
        (t) => t.name.toLowerCase().includes(q) || t.departmentName.toLowerCase().includes(q)
      );
    }
    if (filterDepartmentId) {
      list = list.filter((t) => t.departmentId === filterDepartmentId);
    }
    return list;
  }, [allTeams, filterText, filterDepartmentId]);

  const selectedTeam = teamId ? (allTeams.find((t) => t.id === teamId) ?? null) : null;

  const { data: membersData, isPending: membersPending } = useQuery({
    queryKey: ['teams', teamId, 'members'],
    queryFn: async (): Promise<AssignmentListRes> => {
      const res = await apiFetch(`/api/v1/teams/${teamId}/members?limit=100`);
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AssignmentListRes;
    },
    enabled: !!teamId,
  });

  const { data: leadersData, isPending: leadersPending } = useQuery({
    queryKey: ['teams', teamId, 'team-leads'],
    queryFn: async (): Promise<AssignmentListRes> => {
      const res = await apiFetch(`/api/v1/teams/${teamId}/team-leads?limit=100`);
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AssignmentListRes;
    },
    enabled: !!teamId,
  });

  const invalidateAssignments = () => {
    if (teamId) void queryClient.invalidateQueries({ queryKey: ['teams', teamId, 'members'] });
    if (teamId) void queryClient.invalidateQueries({ queryKey: ['teams', teamId, 'team-leads'] });
  };
  const invalidateDepartments = (cid?: string | null) => {
    if (cid) void queryClient.invalidateQueries({ queryKey: ['companies', cid, 'departments'] });
    else if (companyId)
      void queryClient.invalidateQueries({ queryKey: ['companies', companyId, 'departments'] });
  };

  const createTeam = useMutation({
    mutationFn: async ({ name, departmentId: did }: { name: string; departmentId: string }) => {
      const res = await apiFetch(`/api/v1/departments/${did}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as Team;
    },
    onSuccess: (_, variables) => {
      const dept = departments.find((d) => d.id === variables.departmentId);
      invalidateDepartments(dept?.companyId ?? companyId);
      closeCreateTeam();
      notifications.show({
        title: 'Team created',
        message: 'The team has been created.',
        color: 'green',
      });
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
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as Team;
    },
    onSuccess: (_, variables) => {
      const dept = departments.find((d) => d.id === variables.departmentId);
      invalidateDepartments(dept?.companyId ?? companyId);
      setEditingTeam(null);
      setTeamId(null);
      notifications.show({
        title: 'Team updated',
        message: 'The team has been updated.',
        color: 'green',
      });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const deleteTeam = useMutation({
    mutationFn: async (tid: string) => {
      const res = await apiFetch(`/api/v1/teams/${tid}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, tid) => {
      const team = allTeams.find((t) => t.id === tid);
      const dept = team ? departments.find((d) => d.id === team.departmentId) : undefined;
      invalidateDepartments(dept?.companyId ?? companyId);
      setTeamId(null);
      setDeleteConfirmTeam(null);
      notifications.show({
        title: 'Team deleted',
        message: 'The team has been deleted.',
        color: 'green',
      });
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
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: () => {
      invalidateAssignments();
      setAddMembersOpened(false);
      notifications.show({
        title: 'Member added',
        message: 'The member has been added.',
        color: 'green',
      });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/v1/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: () => {
      invalidateAssignments();
      notifications.show({
        title: 'Member removed',
        message: 'The member has been removed.',
        color: 'green',
      });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const addLeader = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/v1/teams/${teamId}/team-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: () => {
      invalidateAssignments();
      setAddLeadersOpened(false);
      notifications.show({
        title: 'Team leader added',
        message: 'The team leader has been added.',
        color: 'green',
      });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const removeLeader = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/v1/teams/${teamId}/team-leads/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: () => {
      invalidateAssignments();
      notifications.show({
        title: 'Team leader removed',
        message: 'The team leader has been removed.',
        color: 'green',
      });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const departmentOptions = [
    { value: '', label: 'All departments' },
    ...departments.map((d) => ({ value: d.id, label: d.name })),
  ];

  return (
    <Box>
      <Title order={4} mb="md">
        Teams
      </Title>
      <Group align="flex-end" gap="sm" mb="md" wrap="wrap">
        <TextInput
          placeholder="Filter by team or department name"
          value={filterText}
          onChange={(e) => setFilterText(e.currentTarget.value)}
          style={{ minWidth: 220 }}
        />
        <Select
          placeholder="Department"
          data={departmentOptions}
          value={filterDepartmentId ?? ''}
          onChange={(v) => setFilterDepartmentId(v || null)}
          disabled={!companyId}
          clearable
          style={{ width: 180 }}
        />
        <Button
          leftSection={<IconPlus size={14} />}
          onClick={openCreateTeam}
          disabled={!companyId || departments.length === 0}
        >
          Create team
        </Button>
      </Group>

      {companyId && departments.length > 0 && (
        <Table withTableBorder withColumnBorders mb="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Team</Table.Th>
              <Table.Th>Department</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredTeams.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={3}>
                  <Text size="sm" c="dimmed">
                    {allTeams.length === 0
                      ? 'No teams yet. Create a team to get started.'
                      : 'No teams match the filter.'}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              filteredTeams.map((t) => (
                <Table.Tr
                  key={t.id}
                  bg={teamId === t.id ? 'var(--mantine-color-default-hover)' : undefined}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setTeamId(t.id)}
                >
                  <Table.Td>{t.name}</Table.Td>
                  <Table.Td>{t.departmentName}</Table.Td>
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconPencil size={14} />}
                        onClick={() => setEditingTeam(t)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={() => setDeleteConfirmTeam(t)}
                        loading={deleteTeam.isPending}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      )}

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
                onClick={() => selectedTeam && setDeleteConfirmTeam(selectedTeam)}
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
          No company set up. Create a company in the Company tab first.
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
          departments={departments}
          onSubmit={(name, departmentId) => createTeam.mutate({ name, departmentId })}
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
      <Modal
        opened={!!deleteConfirmTeam}
        onClose={() => setDeleteConfirmTeam(null)}
        title="Delete team"
        size="sm"
      >
        {deleteConfirmTeam && (
          <Stack>
            <Text size="sm">
              Really delete team &quot;{deleteConfirmTeam.name}&quot;? This cannot be undone.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDeleteConfirmTeam(null)}>
                Cancel
              </Button>
              <Button
                color="red"
                onClick={() => deleteTeam.mutate(deleteConfirmTeam.id)}
                loading={deleteTeam.isPending}
              >
                Delete
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Box>
  );
}

function CreateTeamForm({
  departments,
  onSubmit,
  onCancel,
  loading,
}: {
  departments: (Department & { teams?: Team[] })[];
  onSubmit: (name: string, departmentId: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.name }));
  return (
    <Stack>
      <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Select
        label="Department"
        placeholder="Select department"
        data={departmentOptions}
        value={departmentId}
        onChange={(v) => setDepartmentId(v)}
        required
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => departmentId && onSubmit(name, departmentId)}
          loading={loading}
          disabled={!name.trim() || !departmentId}
        >
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
  team: TeamWithDept | Team;
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
      return (await res.json()) as AdminUsersRes;
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
