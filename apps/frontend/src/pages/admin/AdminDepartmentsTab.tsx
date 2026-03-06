import { useState, useMemo } from 'react';
import {
  Box,
  Title,
  Text,
  Loader,
  Alert,
  Group,
  Button,
  TextInput,
  Select,
  Stack,
  Card,
  List,
  ActionIcon,
  Modal,
  Table,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconPencil, IconTrash } from '@tabler/icons-react';
import { apiFetch } from '../../api/client';
import type { Company, Department } from 'backend/api-types';

type CompaniesRes = {
  items: (Company & { departments: Department[] })[];
  total: number;
  limit: number;
  offset: number;
};
type DepartmentWithCompany = Department & { companyName: string };
type AssignmentListRes = {
  items: { id: string; name: string }[];
  total: number;
  limit: number;
  offset: number;
};
type AdminUsersRes = { items: { id: string; name: string; email: string | null }[]; total: number };

export function AdminDepartmentsTab() {
  const queryClient = useQueryClient();
  const [filterText, setFilterText] = useState('');
  const [filterCompanyId, setFilterCompanyId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [editingDepartment, setEditingDepartment] = useState<DepartmentWithCompany | null>(null);
  const [addLeadOpened, setAddLeadOpened] = useState(false);
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

  const selectedDepartment = departmentId
    ? (allDepartments.find((d) => d.id === departmentId) ?? null)
    : null;

  const { data: leadsData, isPending: leadsPending } = useQuery({
    queryKey: ['departments', departmentId, 'department-leads'],
    queryFn: async (): Promise<AssignmentListRes> => {
      const res = await apiFetch(`/api/v1/departments/${departmentId}/department-leads?limit=100`);
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AssignmentListRes;
    },
    enabled: !!departmentId,
  });
  const leads = leadsData?.items ?? [];

  const invalidateCompanies = () => void queryClient.invalidateQueries({ queryKey: ['companies'] });
  const invalidateLeads = () => {
    if (departmentId)
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
      setDepartmentId(null);
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
    mutationFn: async (userId: string) => {
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
    onSuccess: () => {
      invalidateLeads();
      setAddLeadOpened(false);
      notifications.show({
        title: 'Department lead added',
        message: 'The department lead has been added.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const removeLead = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/v1/departments/${departmentId}/department-leads/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: () => {
      invalidateLeads();
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
        <Title order={4} mb="sm">
          Departments
        </Title>
        <Loader size="sm" />
      </Box>
    );
  }

  return (
    <Box>
      <Title order={4} mb="md">
        Departments
      </Title>
      <Group align="flex-end" gap="sm" mb="md" wrap="wrap">
        <TextInput
          placeholder="Filter by department or company name"
          value={filterText}
          onChange={(e) => setFilterText(e.currentTarget.value)}
          style={{ minWidth: 220 }}
        />
        <Select
          placeholder="Company"
          data={companyOptions}
          value={filterCompanyId ?? ''}
          onChange={(v) => setFilterCompanyId(v || null)}
          clearable
          style={{ width: 180 }}
        />
        <Button
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
          <Table withTableBorder withColumnBorders mb="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Department</Table.Th>
                <Table.Th>Company</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredDepartments.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={3}>
                    <Text size="sm" c="dimmed">
                      {allDepartments.length === 0
                        ? 'No departments yet. Create a department to get started.'
                        : 'No departments match the filter.'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                filteredDepartments.map((d) => (
                  <Table.Tr
                    key={d.id}
                    bg={departmentId === d.id ? 'var(--mantine-color-default-hover)' : undefined}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setDepartmentId(d.id)}
                  >
                    <Table.Td>{d.name}</Table.Td>
                    <Table.Td>{d.companyName}</Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<IconPencil size={14} />}
                          onClick={() => setEditingDepartment(d)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => setDeleteConfirmDepartment(d)}
                          loading={deleteDepartment.isPending}
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

          {selectedDepartment && (
            <>
              <Group justify="space-between" align="center" mb="sm">
                <Title order={4}>Department: {selectedDepartment.name}</Title>
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconPencil size={14} />}
                    onClick={() => setEditingDepartment(selectedDepartment)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => setDeleteConfirmDepartment(selectedDepartment)}
                    loading={deleteDepartment.isPending}
                  >
                    Delete
                  </Button>
                </Group>
              </Group>
              <Card withBorder padding="md" w={320}>
                <Group justify="space-between" mb="xs">
                  <Text fw={600}>Department leads</Text>
                  <Button
                    size="xs"
                    leftSection={<IconPlus size={12} />}
                    onClick={() => setAddLeadOpened(true)}
                  >
                    Add
                  </Button>
                </Group>
                {leadsPending ? (
                  <Loader size="sm" />
                ) : leads.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No department leads
                  </Text>
                ) : (
                  <List size="sm">
                    {leads.map((u) => (
                      <List.Item key={u.id}>
                        <Group justify="space-between" gap="xs">
                          <span>{u.name}</span>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="red"
                            onClick={() => removeLead.mutate(u.id)}
                            loading={removeLead.isPending}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      </List.Item>
                    ))}
                  </List>
                )}
              </Card>
            </>
          )}
        </>
      )}

      <DepartmentUserPickerModal
        opened={addLeadOpened}
        onClose={() => setAddLeadOpened(false)}
        onSelect={(userId) => addLead.mutate(userId)}
        excludeIds={leads.map((u) => u.id)}
        loading={addLead.isPending}
      />

      <Modal opened={createOpened} onClose={closeCreate} title="Create department" size="sm">
        <CreateDepartmentForm
          companies={companies}
          onSubmit={(name, companyId) => createDepartment.mutate({ name, companyId })}
          onCancel={closeCreate}
          loading={createDepartment.isPending}
        />
      </Modal>

      {editingDepartment && (
        <Modal opened onClose={() => setEditingDepartment(null)} title="Edit department" size="sm">
          <EditDepartmentForm
            department={editingDepartment}
            onSubmit={(name) => updateDepartment.mutate({ id: editingDepartment.id, name })}
            onCancel={() => setEditingDepartment(null)}
            loading={updateDepartment.isPending}
          />
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

function EditDepartmentForm({
  department,
  onSubmit,
  onCancel,
  loading,
}: {
  department: Department;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState(department.name);
  return (
    <Stack>
      <TextInput
        label="Name"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        required
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSubmit(name)} loading={loading} disabled={!name.trim()}>
          Save
        </Button>
      </Group>
    </Stack>
  );
}

function DepartmentUserPickerModal({
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
    <Modal opened={opened} onClose={onClose} title="Add department lead" size="sm">
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
