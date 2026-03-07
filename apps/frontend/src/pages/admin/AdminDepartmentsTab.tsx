import { useState, useMemo } from 'react';
import {
  Box,
  Text,
  Loader,
  Alert,
  Group,
  Button,
  TextInput,
  Select,
  Stack,
  Card,
  Modal,
  Table,
  Tabs,
  MultiSelect,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconPencil, IconTrash } from '@tabler/icons-react';
import { apiFetch } from '../../api/client';
import type { Company, Department } from 'backend/api-types';

type DepartmentWithCounts = Department & {
  _count?: { teams: number };
  departmentLeads?: { user: { id: string; name: string } }[];
};
type CompaniesRes = {
  items: (Company & { departments: DepartmentWithCounts[] })[];
  total: number;
  limit: number;
  offset: number;
};
type DepartmentWithCompany = DepartmentWithCounts & { companyName: string };
type MemberCountsRes = Record<string, number>;
type AssignmentListRes = {
  items: { id: string; name: string }[];
  total: number;
  limit: number;
  offset: number;
};
type AdminUsersRes = { items: { id: string; name: string; email: string | null }[]; total: number };
type DepartmentStatsRes = {
  storageBytesUsed: number;
  teamCount: number;
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

export function AdminDepartmentsTab() {
  const queryClient = useQueryClient();
  const [filterText, setFilterText] = useState('');
  const [filterCompanyId, setFilterCompanyId] = useState<string | null>(null);
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [editingDepartment, setEditingDepartment] = useState<DepartmentWithCompany | null>(null);
  const [departmentCardEditing, setDepartmentCardEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLeadIds, setEditLeadIds] = useState<string[]>([]);
  const [deleteConfirmDepartment, setDeleteConfirmDepartment] =
    useState<DepartmentWithCompany | null>(null);

  const { data: companiesData, isPending: companiesPending } = useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<CompaniesRes> => {
      const res = await apiFetch('/api/v1/companies?limit=100');
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as CompaniesRes;
    },
  });

  const companies = useMemo(() => companiesData?.items ?? [], [companiesData?.items]);
  const allDepartments = useMemo(
    (): DepartmentWithCompany[] =>
      companies.flatMap((c) => (c.departments ?? []).map((d) => ({ ...d, companyName: c.name }))),
    [companies]
  );

  const filteredDepartments = useMemo(() => {
    let list = allDepartments;
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      list = list.filter(
        (d) => d.name.toLowerCase().includes(q) || d.companyName.toLowerCase().includes(q)
      );
    }
    if (filterCompanyId) {
      list = list.filter((d) => d.companyId === filterCompanyId);
    }
    return list;
  }, [allDepartments, filterText, filterCompanyId]);

  const departmentIdsForCounts = useMemo(() => allDepartments.map((d) => d.id), [allDepartments]);
  const { data: memberCountsData } = useQuery({
    queryKey: [
      'admin',
      'departments',
      'member-counts',
      [...departmentIdsForCounts].sort().join(','),
    ],
    queryFn: async (): Promise<MemberCountsRes> => {
      const ids = departmentIdsForCounts.length > 0 ? departmentIdsForCounts.join(',') : '';
      const url =
        ids.length > 0
          ? `/api/v1/admin/departments/member-counts?ids=${encodeURIComponent(ids)}`
          : '/api/v1/admin/departments/member-counts';
      const res = await apiFetch(url);
      if (!res.ok) throw new Error('Failed to load member counts');
      return (await res.json()) as MemberCountsRes;
    },
    enabled: departmentIdsForCounts.length > 0,
  });
  const memberCounts = memberCountsData ?? {};

  const { data: leadsForEditData, isPending: leadsForEditPending } = useQuery({
    queryKey: ['departments', editingDepartment?.id, 'department-leads'],
    queryFn: async (): Promise<AssignmentListRes> => {
      const res = await apiFetch(
        `/api/v1/departments/${editingDepartment!.id}/department-leads?limit=100`
      );
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AssignmentListRes;
    },
    enabled: !!editingDepartment?.id,
  });
  const leadsForEdit = leadsForEditData?.items ?? [];

  const { data: adminUsersData } = useQuery({
    queryKey: ['admin', 'users', 'list'],
    queryFn: async (): Promise<AdminUsersRes> => {
      const res = await apiFetch('/api/v1/admin/users?limit=200&includeDeactivated=false');
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AdminUsersRes;
    },
    enabled: !!editingDepartment?.id,
  });
  const userOptions = useMemo(
    () => (adminUsersData?.items ?? []).map((u) => ({ value: u.id, label: u.name })),
    [adminUsersData?.items]
  );

  const { data: departmentStatsData, isPending: departmentStatsPending } = useQuery({
    queryKey: ['admin', 'departments', editingDepartment?.id, 'stats'],
    queryFn: async (): Promise<DepartmentStatsRes> => {
      const res = await apiFetch(`/api/v1/admin/departments/${editingDepartment!.id}/stats`);
      if (!res.ok) throw new Error('Failed to load stats');
      return (await res.json()) as DepartmentStatsRes;
    },
    enabled: !!editingDepartment?.id,
  });

  const invalidateCompanies = () => void queryClient.invalidateQueries({ queryKey: ['companies'] });
  const invalidateLeads = (departmentId: string) => {
    void queryClient.invalidateQueries({
      queryKey: ['departments', departmentId, 'department-leads'],
    });
  };

  const createDepartment = useMutation({
    mutationFn: async ({ name, companyId: cid }: { name: string; companyId: string }) => {
      const res = await apiFetch(`/api/v1/companies/${cid}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as Department;
    },
    onSuccess: () => {
      invalidateCompanies();
      closeCreate();
      notifications.show({
        title: 'Department created',
        message: 'The department has been created.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const updateDepartment = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiFetch(`/api/v1/departments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as Department;
    },
    onSuccess: () => {
      invalidateCompanies();
      setEditingDepartment(null);
      notifications.show({
        title: 'Department updated',
        message: 'The department has been updated.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const deleteDepartment = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/v1/departments/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: () => {
      invalidateCompanies();
      setDeleteConfirmDepartment(null);
      notifications.show({
        title: 'Department deleted',
        message: 'The department has been deleted.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const addLead = useMutation({
    mutationFn: async ({ departmentId, userId }: { departmentId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/departments/${departmentId}/department-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, { departmentId }) => {
      invalidateLeads(departmentId);
      notifications.show({
        title: 'Department lead added',
        message: 'The department lead has been added.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const removeLead = useMutation({
    mutationFn: async ({ departmentId, userId }: { departmentId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/departments/${departmentId}/department-leads/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, { departmentId }) => {
      invalidateLeads(departmentId);
      notifications.show({
        title: 'Department lead removed',
        message: 'The department lead has been removed.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const companyOptions = [
    { value: '', label: 'All companies' },
    ...companies.map((c) => ({ value: c.id, label: c.name })),
  ];

  if (companiesPending) {
    return (
      <Box>
        <Loader size="sm" />
      </Box>
    );
  }

  return (
    <Box>
      <Group mb="md" justify="space-between" wrap="wrap" gap="sm">
        <Group gap="sm" wrap="wrap">
          <TextInput
            placeholder="Search (department, company)"
            size="xs"
            value={filterText}
            onChange={(e) => setFilterText(e.currentTarget.value)}
          />
          <Select
            placeholder="Company"
            size="xs"
            data={companyOptions}
            value={filterCompanyId ?? ''}
            onChange={(v) => setFilterCompanyId(v || null)}
            clearable
            style={{ width: 160 }}
          />
        </Group>
        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={openCreate}
          disabled={companies.length === 0}
        >
          Create department
        </Button>
      </Group>

      {companies.length === 0 ? (
        <Alert color="blue">No company set up. Create a company in the Company tab first.</Alert>
      ) : (
        <>
          <Table withTableBorder withColumnBorders mb="md" className="admin-table-hover">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Department</Table.Th>
                <Table.Th>Company</Table.Th>
                <Table.Th>Leads</Table.Th>
                <Table.Th>Members</Table.Th>
                <Table.Th>Teams</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredDepartments.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text size="sm" c="dimmed">
                      {allDepartments.length === 0
                        ? 'No departments yet. Create a department to get started.'
                        : 'No departments match the filter.'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                filteredDepartments.map((d) => {
                  const leadNames = d.departmentLeads?.map((l) => l.user.name).join(', ') ?? '';
                  return (
                    <Table.Tr key={d.id}>
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
                          onClick={() => setEditingDepartment(d)}
                        >
                          {d.name}
                        </Text>
                      </Table.Td>
                      <Table.Td>{d.companyName}</Table.Td>
                      <Table.Td>{leadNames || '–'}</Table.Td>
                      <Table.Td>
                        {memberCounts[d.id] !== undefined ? String(memberCounts[d.id]) : '–'}
                      </Table.Td>
                      <Table.Td>
                        {d._count?.teams !== undefined ? String(d._count.teams) : '–'}
                      </Table.Td>
                    </Table.Tr>
                  );
                })
              )}
            </Table.Tbody>
          </Table>
        </>
      )}

      <Modal opened={createOpened} onClose={closeCreate} title="Create department" size="sm">
        <CreateDepartmentForm
          companies={companies}
          onSubmit={(name, companyId) => createDepartment.mutate({ name, companyId })}
          onCancel={closeCreate}
          loading={createDepartment.isPending}
        />
      </Modal>

      {editingDepartment && (
        <Modal
          opened
          onClose={() => setEditingDepartment(null)}
          title={`Department: ${editingDepartment.name}`}
          size="lg"
          key={editingDepartment.id}
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
                    Department
                  </Text>
                  {!departmentCardEditing && (
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconPencil size={14} />}
                      onClick={() => {
                        setEditName(editingDepartment.name);
                        setEditLeadIds(leadsForEdit.map((u) => u.id));
                        setDepartmentCardEditing(true);
                      }}
                    >
                      Edit
                    </Button>
                  )}
                </Group>
                {departmentCardEditing ? (
                  <Stack gap="md">
                    <TextInput
                      label="Name"
                      value={editName}
                      onChange={(e) => setEditName(e.currentTarget.value)}
                      required
                    />
                    <MultiSelect
                      label="Lead"
                      placeholder="Select department leads"
                      data={userOptions}
                      value={editLeadIds}
                      onChange={setEditLeadIds}
                      searchable
                      clearable
                    />
                    <Group gap="xs">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => setDepartmentCardEditing(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          const name = editName.trim();
                          if (!name) return;
                          void (async () => {
                            try {
                              if (name !== editingDepartment.name) {
                                await updateDepartment.mutateAsync({
                                  id: editingDepartment.id,
                                  name,
                                });
                              }
                              const currentIds = leadsForEdit.map((u) => u.id);
                              const toAdd = editLeadIds.filter((id) => !currentIds.includes(id));
                              const toRemove = currentIds.filter((id) => !editLeadIds.includes(id));
                              await Promise.all([
                                ...toAdd.map((userId) =>
                                  addLead.mutateAsync({
                                    departmentId: editingDepartment.id,
                                    userId,
                                  })
                                ),
                                ...toRemove.map((userId) =>
                                  removeLead.mutateAsync({
                                    departmentId: editingDepartment.id,
                                    userId,
                                  })
                                ),
                              ]);
                              setEditingDepartment((prev) =>
                                prev && prev.id === editingDepartment.id ? { ...prev, name } : prev
                              );
                              invalidateLeads(editingDepartment.id);
                              setDepartmentCardEditing(false);
                            } catch {
                              // notifications from mutations
                            }
                          })();
                        }}
                        loading={
                          updateDepartment.isPending || addLead.isPending || removeLead.isPending
                        }
                        disabled={!editName.trim()}
                      >
                        Save
                      </Button>
                    </Group>
                  </Stack>
                ) : leadsForEditPending ? (
                  <Loader size="sm" />
                ) : (
                  <Stack gap="xs">
                    <div>
                      <Text size="xs" c="dimmed">
                        Name
                      </Text>
                      <Text size="sm">{editingDepartment.name}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Lead
                      </Text>
                      <Text size="sm">
                        {leadsForEdit.length === 0
                          ? '–'
                          : leadsForEdit.map((u) => u.name).join(', ')}
                      </Text>
                    </div>
                  </Stack>
                )}
              </Card>
              <Card withBorder padding="md" mt="md">
                <Text size="sm" fw={600} mb="xs">
                  Stats
                </Text>
                {departmentStatsPending ? (
                  <Loader size="sm" />
                ) : departmentStatsData ? (
                  <Group gap="lg">
                    <div>
                      <Text size="xs" c="dimmed">
                        Storage
                      </Text>
                      <Text size="sm">{formatBytes(departmentStatsData.storageBytesUsed)}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Teams
                      </Text>
                      <Text size="sm">{departmentStatsData.teamCount}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Members
                      </Text>
                      <Text size="sm">{departmentStatsData.memberCount}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Documents
                      </Text>
                      <Text size="sm">{departmentStatsData.documentCount}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Processes
                      </Text>
                      <Text size="sm">{departmentStatsData.processCount}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Projects
                      </Text>
                      <Text size="sm">{departmentStatsData.projectCount}</Text>
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
                  onClick={() => setDeleteConfirmDepartment(editingDepartment)}
                  loading={deleteDepartment.isPending}
                >
                  Delete department
                </Button>
              </Card>
            </Tabs.Panel>
          </Tabs>
        </Modal>
      )}

      <Modal
        opened={!!deleteConfirmDepartment}
        onClose={() => setDeleteConfirmDepartment(null)}
        title="Delete department"
        size="sm"
      >
        {deleteConfirmDepartment && (
          <Stack>
            <Text size="sm">
              Really delete department &quot;{deleteConfirmDepartment.name}&quot;? Not possible when
              teams or dependencies exist.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDeleteConfirmDepartment(null)}>
                Cancel
              </Button>
              <Button
                color="red"
                onClick={() => deleteDepartment.mutate(deleteConfirmDepartment.id)}
                loading={deleteDepartment.isPending}
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

function CreateDepartmentForm({
  companies,
  onSubmit,
  onCancel,
  loading,
}: {
  companies: Company[];
  onSubmit: (name: string, companyId: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const options = companies.map((c) => ({ value: c.id, label: c.name }));
  return (
    <Stack>
      <TextInput
        label="Name"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        required
      />
      <Select
        label="Company"
        placeholder="Select company"
        data={options}
        value={companyId}
        onChange={setCompanyId}
        required
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => companyId && onSubmit(name, companyId)}
          loading={loading}
          disabled={!name.trim() || !companyId}
        >
          Create
        </Button>
      </Group>
    </Stack>
  );
}
