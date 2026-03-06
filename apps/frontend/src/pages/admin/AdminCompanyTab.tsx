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
import type { Company } from 'backend/api-types';

type CompaniesRes = { items: Company[]; total: number; limit: number; offset: number };
type AssignmentListRes = {
  items: { id: string; name: string }[];
  total: number;
  limit: number;
  offset: number;
};
type AdminUsersRes = { items: { id: string; name: string; email: string | null }[]; total: number };

export function AdminCompanyTab() {
  const queryClient = useQueryClient();
  const [filterText, setFilterText] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [addLeadOpened, setAddLeadOpened] = useState(false);
  const [deleteConfirmCompany, setDeleteConfirmCompany] = useState<Company | null>(null);

  const { data: companiesData, isPending: companiesPending } = useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<CompaniesRes> => {
      const res = await apiFetch('/api/v1/companies?limit=100');
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as CompaniesRes;
    },
  });

  const companies = useMemo(() => companiesData?.items ?? [], [companiesData?.items]);
  const singleCompany = companies.length <= 1 ? (companies[0] ?? null) : null;
  const selectedCompanyId = companyId ?? singleCompany?.id ?? null;
  const selectedCompany = selectedCompanyId
    ? (companies.find((c) => c.id === selectedCompanyId) ?? null)
    : null;

  const filteredCompanies = useMemo(() => {
    if (companies.length <= 1) return companies;
    if (!filterText.trim()) return companies;
    const q = filterText.trim().toLowerCase();
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, filterText]);

  const { data: leadsData, isPending: leadsPending } = useQuery({
    queryKey: ['companies', selectedCompanyId, 'company-leads'],
    queryFn: async (): Promise<AssignmentListRes> => {
      const res = await apiFetch(`/api/v1/companies/${selectedCompanyId}/company-leads?limit=100`);
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AssignmentListRes;
    },
    enabled: !!selectedCompanyId,
  });
  const leads = leadsData?.items ?? [];

  const invalidateCompanies = () => void queryClient.invalidateQueries({ queryKey: ['companies'] });
  const invalidateLeads = () => {
    if (selectedCompanyId)
      void queryClient.invalidateQueries({
        queryKey: ['companies', selectedCompanyId, 'company-leads'],
      });
  };

  const createCompany = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiFetch('/api/v1/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as Company;
    },
    onSuccess: () => {
      invalidateCompanies();
      closeCreate();
      notifications.show({
        title: 'Company created',
        message: 'The company has been created.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const updateCompany = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiFetch(`/api/v1/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as Company;
    },
    onSuccess: () => {
      invalidateCompanies();
      setEditingCompany(null);
      notifications.show({
        title: 'Company updated',
        message: 'The company has been updated.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const deleteCompany = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/v1/companies/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: () => {
      invalidateCompanies();
      setCompanyId(null);
      setDeleteConfirmCompany(null);
      notifications.show({
        title: 'Company deleted',
        message: 'The company has been deleted.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const addLead = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/v1/companies/${selectedCompanyId}/company-leads`, {
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
        title: 'Company lead added',
        message: 'The company lead has been added.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const removeLead = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/v1/companies/${selectedCompanyId}/company-leads/${userId}`, {
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
        title: 'Company lead removed',
        message: 'The company lead has been removed.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  if (companiesPending) {
    return (
      <Box>
        <Title order={4} mb="sm">
          Company
        </Title>
        <Loader size="sm" />
      </Box>
    );
  }

  const showList = companies.length > 1;

  return (
    <Box>
      <Title order={4} mb="md">
        Company
      </Title>

      {showList ? (
        <>
          <Group align="flex-end" gap="sm" mb="md" wrap="wrap">
            <TextInput
              placeholder="Filter by company name"
              value={filterText}
              onChange={(e) => setFilterText(e.currentTarget.value)}
              style={{ minWidth: 220 }}
            />
            <Button leftSection={<IconPlus size={14} />} onClick={openCreate}>
              Create company
            </Button>
          </Group>
          <Table withTableBorder withColumnBorders mb="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Company</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredCompanies.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={2}>
                    <Text size="sm" c="dimmed">
                      {companies.length === 0
                        ? 'No companies yet. Create a company to get started.'
                        : 'No companies match the filter.'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                filteredCompanies.map((c) => (
                  <Table.Tr
                    key={c.id}
                    bg={companyId === c.id ? 'var(--mantine-color-default-hover)' : undefined}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setCompanyId(c.id)}
                  >
                    <Table.Td>{c.name}</Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<IconPencil size={14} />}
                          onClick={() => setEditingCompany(c)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => setDeleteConfirmCompany(c)}
                          loading={deleteCompany.isPending}
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
        </>
      ) : (
        <>
          {companies.length === 0 ? (
            <Alert color="blue" mb="md">
              No company set up. Create the company first, then manage company leads.
            </Alert>
          ) : null}
          {singleCompany && (
            <Group align="center" gap="xs" mb="md">
              <Title order={4}>{singleCompany.name}</Title>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconPencil size={14} />}
                onClick={() => setEditingCompany(singleCompany)}
              >
                Edit
              </Button>
            </Group>
          )}
          {companies.length === 0 && (
            <Button leftSection={<IconPlus size={14} />} onClick={openCreate} mb="md">
              Create company
            </Button>
          )}
        </>
      )}

      {selectedCompany && (
        <>
          {showList && (
            <Group justify="space-between" align="center" mb="sm">
              <Title order={4}>Company: {selectedCompany.name}</Title>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPencil size={14} />}
                  onClick={() => setEditingCompany(selectedCompany)}
                >
                  Edit
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => setDeleteConfirmCompany(selectedCompany)}
                  loading={deleteCompany.isPending}
                >
                  Delete
                </Button>
              </Group>
            </Group>
          )}
          <Card withBorder padding="md" w={320}>
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Company leads</Text>
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
                No company leads
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

      <CompanyUserPickerModal
        opened={addLeadOpened}
        onClose={() => setAddLeadOpened(false)}
        onSelect={(userId) => addLead.mutate(userId)}
        excludeIds={leads.map((u) => u.id)}
        loading={addLead.isPending}
      />

      <Modal opened={createOpened} onClose={closeCreate} title="Create company" size="sm">
        <CompanyForm
          initialName=""
          onSubmit={(name) => createCompany.mutate(name)}
          onCancel={closeCreate}
          loading={createCompany.isPending}
        />
      </Modal>

      {editingCompany && (
        <Modal
          opened
          onClose={() => setEditingCompany(null)}
          title="Edit company"
          size="sm"
          key={editingCompany.id}
        >
          <CompanyForm
            initialName={editingCompany.name}
            onSubmit={(name) => updateCompany.mutate({ id: editingCompany.id, name })}
            onCancel={() => setEditingCompany(null)}
            loading={updateCompany.isPending}
          />
        </Modal>
      )}

      <Modal
        opened={!!deleteConfirmCompany}
        onClose={() => setDeleteConfirmCompany(null)}
        title="Delete company"
        size="sm"
      >
        {deleteConfirmCompany && (
          <Stack>
            <Text size="sm">
              Really delete company &quot;{deleteConfirmCompany.name}&quot;? Not possible when
              departments exist.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDeleteConfirmCompany(null)}>
                Cancel
              </Button>
              <Button
                color="red"
                onClick={() => deleteCompany.mutate(deleteConfirmCompany.id)}
                loading={deleteCompany.isPending}
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

function CompanyForm({
  initialName,
  onSubmit,
  onCancel,
  loading,
}: {
  initialName: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initialName);
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

function CompanyUserPickerModal({
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
    <Modal opened={opened} onClose={onClose} title="Add company lead" size="sm">
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
