import { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Select,
  Stack,
  Card,
  Group,
  Button,
  Text,
  Loader,
  Alert,
  Modal,
  TextInput,
  Table,
  Tabs,
  MultiSelect,
  Badge,
  Pagination,
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
type TeamStatsRes = {
  storageBytesUsed: number;
  memberCount: number;
  documentCount: number;
  processCount: number;
  projectCount: number;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type TeamWithDept = Team & { departmentId: string; departmentName: string };
const TEAMS_PAGE_SIZE_KEY = 'docsops-admin-teams-page-size';
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;

export function AdminTeamsTab() {
  const queryClient = useQueryClient();
  const [filterText, setFilterText] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem(TEAMS_PAGE_SIZE_KEY);
      if (!raw) return DEFAULT_PAGE_SIZE;
      const parsed = Number(raw);
      return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])
        ? parsed
        : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [createTeamOpened, { open: openCreateTeam, close: closeCreateTeam }] = useDisclosure(false);
  const [editingTeam, setEditingTeam] = useState<TeamWithDept | null>(null);
  const [teamCardEditing, setTeamCardEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDepartmentId, setEditDepartmentId] = useState('');
  const [editLeadIds, setEditLeadIds] = useState<string[]>([]);
  const [editMemberIds, setEditMemberIds] = useState<string[]>([]);
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
  const totalPages = Math.max(1, Math.ceil(filteredTeams.length / limit));
  const pagedTeams = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredTeams.slice(start, start + limit);
  }, [filteredTeams, page, limit]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const { data: leadsForEditData, isPending: leadsForEditPending } = useQuery({
    queryKey: ['teams', editingTeam?.id, 'team-leads'],
    queryFn: async (): Promise<AssignmentListRes> => {
      const res = await apiFetch(`/api/v1/teams/${editingTeam!.id}/team-leads?limit=100`);
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AssignmentListRes;
    },
    enabled: !!editingTeam?.id,
  });
  const leadsForEdit = leadsForEditData?.items ?? [];

  const { data: membersForEditData, isPending: membersForEditPending } = useQuery({
    queryKey: ['admin', 'teams', editingTeam?.id, 'members'],
    queryFn: async (): Promise<AssignmentListRes> => {
      const res = await apiFetch(`/api/v1/admin/teams/${editingTeam!.id}/members?limit=500`);
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AssignmentListRes;
    },
    enabled: !!editingTeam?.id,
  });
  const membersForEdit = membersForEditData?.items ?? [];

  useEffect(() => {
    const members = membersForEditData?.items ?? [];
    if (teamCardEditing && editingTeam?.id && members.length > 0 && editMemberIds.length === 0) {
      setEditMemberIds(members.map((m) => m.id));
    }
  }, [teamCardEditing, editingTeam?.id, membersForEditData, editMemberIds.length]);

  const { data: adminUsersData } = useQuery({
    queryKey: ['admin', 'users', 'list'],
    queryFn: async (): Promise<AdminUsersRes> => {
      const res = await apiFetch('/api/v1/admin/users?limit=200&includeDeactivated=false');
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AdminUsersRes;
    },
    enabled: !!editingTeam?.id,
  });
  const userOptions = useMemo(
    () => (adminUsersData?.items ?? []).map((u) => ({ value: u.id, label: u.name })),
    [adminUsersData?.items]
  );

  const { data: teamStatsData, isPending: teamStatsPending } = useQuery({
    queryKey: ['admin', 'teams', editingTeam?.id, 'stats'],
    queryFn: async (): Promise<TeamStatsRes> => {
      const res = await apiFetch(`/api/v1/admin/teams/${editingTeam!.id}/stats`);
      if (!res.ok) throw new Error('Failed to load stats');
      return (await res.json()) as TeamStatsRes;
    },
    enabled: !!editingTeam?.id,
  });

  type TeamBatchRow = { memberCount: number; leadNames: string[] };
  const teamIdsForBatch = useMemo(() => filteredTeams.map((t) => t.id), [filteredTeams]);
  const { data: teamBatchData } = useQuery({
    queryKey: ['teams', 'batch', [...teamIdsForBatch].sort().join(',')],
    queryFn: async (): Promise<Record<string, TeamBatchRow>> => {
      const entries = await Promise.all(
        teamIdsForBatch.map(async (tid) => {
          const [statsRes, leadRes] = await Promise.all([
            apiFetch(`/api/v1/admin/teams/${tid}/stats`),
            apiFetch(`/api/v1/teams/${tid}/team-leads?limit=100`),
          ]);
          const statsData = statsRes.ok ? ((await statsRes.json()) as TeamStatsRes) : null;
          const leadData = leadRes.ok
            ? ((await leadRes.json()) as AssignmentListRes)
            : { items: [] as AssignmentItem[] };
          const memberCount = statsData?.memberCount ?? 0;
          const leadNames = leadData.items.map((l) => l.name);
          return [tid, { memberCount, leadNames }] as const;
        })
      );
      return Object.fromEntries(entries);
    },
    enabled: teamIdsForBatch.length > 0,
  });

  const invalidateAssignments = (tid?: string) => {
    if (tid) {
      void queryClient.invalidateQueries({ queryKey: ['teams', tid, 'members'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'teams', tid, 'members'] });
      void queryClient.invalidateQueries({ queryKey: ['teams', tid, 'team-leads'] });
    }
    void queryClient.invalidateQueries({ queryKey: ['teams', 'batch'] });
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

  const addLeader = useMutation({
    mutationFn: async ({ teamId: tid, userId }: { teamId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/teams/${tid}/team-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, { teamId: tid }) => {
      invalidateAssignments(tid);
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
    mutationFn: async ({ teamId: tid, userId }: { teamId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/teams/${tid}/team-leads/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, { teamId: tid }) => {
      invalidateAssignments(tid);
      notifications.show({
        title: 'Team leader removed',
        message: 'The team leader has been removed.',
        color: 'green',
      });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const addMember = useMutation({
    mutationFn: async ({ teamId: tid, userId }: { teamId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/teams/${tid}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, { teamId: tid }) => {
      invalidateAssignments(tid);
      notifications.show({
        title: 'Member added',
        message: 'The member has been added to the team.',
        color: 'green',
      });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const removeMember = useMutation({
    mutationFn: async ({ teamId: tid, userId }: { teamId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/teams/${tid}/members/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, { teamId: tid }) => {
      invalidateAssignments(tid);
      notifications.show({
        title: 'Member removed',
        message: 'The member has been removed from the team.',
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
      <Group mb="md" justify="space-between" wrap="wrap" gap="sm">
        <Group gap="sm" wrap="wrap">
          <TextInput
            placeholder="Search (team, department)"
            size="xs"
            value={filterText}
            onChange={(e) => {
              setFilterText(e.currentTarget.value);
              setPage(1);
            }}
          />
          <Select
            placeholder="Department"
            size="xs"
            data={departmentOptions}
            value={filterDepartmentId ?? ''}
            onChange={(v) => {
              setFilterDepartmentId(v || null);
              setPage(1);
            }}
            disabled={!companyId}
            clearable
            style={{ width: 160 }}
          />
        </Group>
        <Group gap="sm" align="flex-end">
          <Text size="sm" c="dimmed">
            {filteredTeams.length} team(s)
          </Text>
          <Select
            label="Per page"
            data={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
            value={String(limit)}
            onChange={(value) => {
              const next = Number(value ?? DEFAULT_PAGE_SIZE);
              setLimit(next);
              setPage(1);
              try {
                window.localStorage.setItem(TEAMS_PAGE_SIZE_KEY, String(next));
              } catch {
                /* ignore */
              }
            }}
            style={{ width: 100 }}
          />
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={openCreateTeam}
            disabled={!companyId || departments.length === 0}
          >
            Create team
          </Button>
        </Group>
      </Group>

      {companyId && departments.length > 0 && (
        <Table withTableBorder withColumnBorders mb="md" className="admin-table-hover">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Team</Table.Th>
              <Table.Th>Department</Table.Th>
              <Table.Th>Lead</Table.Th>
              <Table.Th>Members</Table.Th>
              <Table.Th>Schreibrechte</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pagedTeams.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text size="sm" c="dimmed">
                    {allTeams.length === 0
                      ? 'No teams yet. Create a team to get started.'
                      : 'No teams match the filter.'}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              pagedTeams.map((t) => {
                const batch = teamBatchData?.[t.id];
                const leadText = batch?.leadNames?.length ? batch.leadNames.join(', ') : '–';
                return (
                  <Table.Tr key={t.id}>
                    <Table.Td>
                      <Text
                        component="button"
                        type="button"
                        variant="link"
                        c="var(--mantine-primary-color-4)"
                        className="admin-link-hover"
                        size="sm"
                        style={{
                          cursor: 'pointer',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                        }}
                        onClick={() => setEditingTeam(t)}
                      >
                        {t.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>{t.departmentName}</Table.Td>
                    <Table.Td>{leadText}</Table.Td>
                    <Table.Td>{batch != null ? String(batch.memberCount) : '–'}</Table.Td>
                    <Table.Td>{leadText}</Table.Td>
                  </Table.Tr>
                );
              })
            )}
          </Table.Tbody>
        </Table>
      )}
      {filteredTeams.length > limit && (
        <Group justify="flex-end" mt="md">
          <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
        </Group>
      )}

      {!companyId && (
        <Alert color="blue" mt="md">
          No company set up. Create a company in the Company tab first.
        </Alert>
      )}

      <Modal opened={createTeamOpened} onClose={closeCreateTeam} title="Create team" size="sm">
        <CreateTeamForm
          departments={departments}
          onSubmit={(name, departmentId) => createTeam.mutate({ name, departmentId })}
          onCancel={closeCreateTeam}
          loading={createTeam.isPending}
        />
      </Modal>
      {editingTeam && (
        <Modal
          opened
          onClose={() => setEditingTeam(null)}
          title={`Team: ${editingTeam.name}`}
          size="lg"
          key={editingTeam.id}
        >
          <Tabs defaultValue="overview">
            <Tabs.List>
              <Tabs.Tab value="overview">Overview</Tabs.Tab>
              <Tabs.Tab value="manage">Manage</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="overview" pt="md">
              <Card withBorder padding="md">
                <Group justify="space-between" mb="md">
                  <Text size="sm" fw={600}>
                    Team
                  </Text>
                  {!teamCardEditing && (
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconPencil size={14} />}
                      onClick={() => {
                        setEditName(editingTeam.name);
                        setEditDepartmentId(editingTeam.departmentId);
                        setEditLeadIds(leadsForEdit.map((u) => u.id));
                        setEditMemberIds(membersForEdit.map((m) => m.id));
                        setTeamCardEditing(true);
                      }}
                    >
                      Edit
                    </Button>
                  )}
                </Group>
                {teamCardEditing ? (
                  <Stack gap="md">
                    <TextInput
                      label="Name"
                      value={editName}
                      onChange={(e) => setEditName(e.currentTarget.value)}
                      required
                    />
                    <Select
                      label="Department"
                      data={departments.map((d) => ({ value: d.id, label: d.name }))}
                      value={editDepartmentId}
                      onChange={(v) => v && setEditDepartmentId(v)}
                      required
                    />
                    <MultiSelect
                      label="Lead"
                      placeholder="Select team leads"
                      data={userOptions}
                      value={editLeadIds}
                      onChange={setEditLeadIds}
                      searchable
                      clearable
                    />
                    <MultiSelect
                      label="Members"
                      placeholder="Select team members"
                      data={userOptions}
                      value={editMemberIds}
                      onChange={setEditMemberIds}
                      searchable
                      clearable
                    />
                    <Group gap="xs">
                      <Button size="sm" variant="default" onClick={() => setTeamCardEditing(false)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          const name = editName.trim();
                          if (!name || !editDepartmentId) return;
                          void (async () => {
                            try {
                              if (
                                name !== editingTeam.name ||
                                editDepartmentId !== editingTeam.departmentId
                              ) {
                                await updateTeam.mutateAsync({
                                  teamId: editingTeam.id,
                                  name,
                                  departmentId: editDepartmentId,
                                });
                              }
                              const tid = editingTeam.id;
                              const currentMemberIds = membersForEdit.map((m) => m.id);
                              const toAddMembers = editMemberIds.filter(
                                (id) => !currentMemberIds.includes(id)
                              );
                              const toRemoveMembers = currentMemberIds.filter(
                                (id) => !editMemberIds.includes(id)
                              );
                              for (const userId of toRemoveMembers) {
                                if (leadsForEdit.some((l) => l.id === userId)) {
                                  await removeLeader.mutateAsync({ teamId: tid, userId });
                                }
                                await removeMember.mutateAsync({ teamId: tid, userId });
                              }
                              for (const userId of toAddMembers) {
                                await addMember.mutateAsync({ teamId: tid, userId });
                              }
                              const currentLeadIds = leadsForEdit.map((u) => u.id);
                              const toAddLeads = editLeadIds.filter(
                                (id) => !currentLeadIds.includes(id)
                              );
                              const toRemoveLeads = currentLeadIds.filter(
                                (id) => !editLeadIds.includes(id)
                              );
                              await Promise.all([
                                ...toAddLeads.map((userId) =>
                                  addLeader.mutateAsync({ teamId: tid, userId })
                                ),
                                ...toRemoveLeads.map((userId) =>
                                  removeLeader.mutateAsync({ teamId: tid, userId })
                                ),
                              ]);
                              setEditingTeam((prev) =>
                                prev && prev.id === tid
                                  ? {
                                      ...prev,
                                      name,
                                      departmentId: editDepartmentId,
                                      departmentName:
                                        departments.find((d) => d.id === editDepartmentId)?.name ??
                                        prev.departmentName,
                                    }
                                  : prev
                              );
                              invalidateAssignments(tid);
                              setTeamCardEditing(false);
                            } catch {
                              // notifications from mutations
                            }
                          })();
                        }}
                        loading={
                          updateTeam.isPending ||
                          addLeader.isPending ||
                          removeLeader.isPending ||
                          addMember.isPending ||
                          removeMember.isPending
                        }
                        disabled={!editName.trim() || !editDepartmentId}
                      >
                        Save
                      </Button>
                    </Group>
                  </Stack>
                ) : (
                  <Stack gap="xs">
                    <div>
                      <Text size="xs" c="dimmed">
                        Name
                      </Text>
                      <Text size="sm">{editingTeam.name}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Department
                      </Text>
                      <Text size="sm">{editingTeam.departmentName}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Lead
                      </Text>
                      {leadsForEditPending ? (
                        <Loader size="xs" />
                      ) : leadsForEdit.length === 0 ? (
                        <Text size="sm">–</Text>
                      ) : (
                        <Group gap="xs" mt={4}>
                          {leadsForEdit.map((u) => (
                            <Badge key={u.id} size="sm" variant="light">
                              {u.name}
                            </Badge>
                          ))}
                        </Group>
                      )}
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Members
                      </Text>
                      {membersForEditPending ? (
                        <Loader size="xs" />
                      ) : membersForEdit.length === 0 ? (
                        <Text size="sm">–</Text>
                      ) : (
                        <Group gap="xs" mt={4} wrap="wrap">
                          {membersForEdit.map((m) => (
                            <Badge key={m.id} size="sm" variant="light">
                              {m.name}
                            </Badge>
                          ))}
                        </Group>
                      )}
                    </div>
                  </Stack>
                )}
              </Card>
              <Card withBorder padding="md" mt="md">
                <Text size="sm" fw={600} mb="xs">
                  Stats
                </Text>
                {teamStatsPending ? (
                  <Loader size="sm" />
                ) : teamStatsData ? (
                  <Group gap="lg">
                    <div>
                      <Text size="xs" c="dimmed">
                        Storage
                      </Text>
                      <Text size="sm">{formatBytes(teamStatsData.storageBytesUsed)}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Members
                      </Text>
                      <Text size="sm">{teamStatsData.memberCount}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Documents
                      </Text>
                      <Text size="sm">{teamStatsData.documentCount}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Processes
                      </Text>
                      <Text size="sm">{teamStatsData.processCount}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Projects
                      </Text>
                      <Text size="sm">{teamStatsData.projectCount}</Text>
                    </div>
                  </Group>
                ) : null}
              </Card>
            </Tabs.Panel>
            <Tabs.Panel value="manage" pt="md">
              <Card withBorder padding="md">
                <Text size="sm" fw={600} mb="xs">
                  Manage
                </Text>
                <Text size="xs" c="dimmed" mb="md">
                  Sensitive actions. Use with care.
                </Text>
                <Button
                  size="sm"
                  variant="light"
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => setDeleteConfirmTeam(editingTeam)}
                  loading={deleteTeam.isPending}
                >
                  Delete team
                </Button>
              </Card>
            </Tabs.Panel>
          </Tabs>
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
