import { useState, useMemo } from 'react';
import {
  Box,
  Text,
  Loader,
  Alert,
  Group,
  Button,
  Stack,
  Card,
  Modal,
  Table,
  Tabs,
  TextInput,
  MultiSelect,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { apiFetch } from '../../api/client';
import type { Company } from 'backend/api-types';
import { CompanyForm } from './AdminCompanyForm';

type CompaniesRes = { items: Company[]; total: number; limit: number; offset: number };
type AssignmentListRes = {
  items: { id: string; name: string }[];
  total: number;
  limit: number;
  offset: number;
};
type AdminUsersRes = { items: { id: string; name: string; email: string | null }[]; total: number };
type CompanyStatsRes = {
  storageBytesUsed: number;
  departmentCount: number;
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

export function AdminCompanyTab() {
  const queryClient = useQueryClient();
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [companyCardEditing, setCompanyCardEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLeadIds, setEditLeadIds] = useState<string[]>([]);
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
  const companyIds = useMemo(() => companies.map((c) => c.id), [companies]);

  const { data: leadsBatchData } = useQuery({
    queryKey: ['companies', 'leads-batch', companyIds.join(',')],
    queryFn: async (): Promise<Record<string, { id: string; name: string }[]>> => {
      const entries = await Promise.all(
        companyIds.map(async (cid) => {
          const res = await apiFetch(`/api/v1/companies/${cid}/company-leads?limit=100`);
          const items = res.ok ? ((await res.json()) as AssignmentListRes).items : [];
          return [cid, items] as const;
        })
      );
      return Object.fromEntries(entries);
    },
    enabled: companyIds.length > 0,
  });

  const { data: leadsForEditData, isPending: leadsForEditPending } = useQuery({
    queryKey: ['companies', editingCompany?.id, 'company-leads'],
    queryFn: async (): Promise<AssignmentListRes> => {
      const res = await apiFetch(`/api/v1/companies/${editingCompany!.id}/company-leads?limit=100`);
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AssignmentListRes;
    },
    enabled: !!editingCompany?.id,
  });
  const leadsForEdit = leadsForEditData?.items ?? [];

  const { data: adminUsersData } = useQuery({
    queryKey: ['admin', 'users', 'list'],
    queryFn: async (): Promise<AdminUsersRes> => {
      const res = await apiFetch('/api/v1/admin/users?limit=200&includeDeactivated=false');
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AdminUsersRes;
    },
    enabled: !!editingCompany?.id,
  });
  const userOptions = useMemo(
    () => (adminUsersData?.items ?? []).map((u) => ({ value: u.id, label: u.name })),
    [adminUsersData?.items]
  );

  const { data: companyStatsData, isPending: companyStatsPending } = useQuery({
    queryKey: ['admin', 'companies', editingCompany?.id, 'stats'],
    queryFn: async (): Promise<CompanyStatsRes> => {
      const res = await apiFetch(`/api/v1/admin/companies/${editingCompany!.id}/stats`);
      if (!res.ok) throw new Error('Failed to load stats');
      return (await res.json()) as CompanyStatsRes;
    },
    enabled: !!editingCompany?.id,
  });

  const invalidateCompanies = () => void queryClient.invalidateQueries({ queryKey: ['companies'] });
  const invalidateLeads = (cid: string) => {
    void queryClient.invalidateQueries({ queryKey: ['companies', cid, 'company-leads'] });
    void queryClient.invalidateQueries({ queryKey: ['companies', 'leads-batch'] });
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
    onSuccess: (_, variables) => {
      invalidateCompanies();
      setEditingCompany((prev) =>
        prev && prev.id === variables.id ? { ...prev, name: variables.name } : prev
      );
      setCompanyCardEditing(false);
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
    mutationFn: async ({ companyId, userId }: { companyId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/companies/${companyId}/company-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, { companyId }) => {
      invalidateLeads(companyId);
      notifications.show({
        title: 'Company lead added',
        message: 'The company lead has been added.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const removeLead = useMutation({
    mutationFn: async ({ companyId, userId }: { companyId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/companies/${companyId}/company-leads/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, { companyId }) => {
      invalidateLeads(companyId);
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
        <Loader size="sm" />
      </Box>
    );
  }

  return (
    <Box>
      {companies.length === 0 && (
        <Group mb="md" justify="flex-end">
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={openCreate}>
            Create company
          </Button>
        </Group>
      )}

      {companies.length === 0 ? (
        <Alert color="blue" mb="md">
          No company set up. Create the company first, then manage company leads.
        </Alert>
      ) : (
        <Table withTableBorder withColumnBorders mb="md" className="admin-table-hover">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Company</Table.Th>
              <Table.Th>Lead</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {companies.map((c) => {
              const leadNames = leadsBatchData?.[c.id]?.map((u) => u.name) ?? [];
              const leadText = leadNames.length > 0 ? leadNames.join(', ') : '–';
              return (
                <Table.Tr key={c.id}>
                  <Table.Td>
                    <Text
                      component="button"
                      type="button"
                      variant="link"
                      c="var(--mantine-color-blue-6)"
                      size="sm"
                      className="admin-link-hover"
                      style={{
                        cursor: 'pointer',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                      }}
                      onClick={() => {
                        setEditingCompany(c);
                        setCompanyCardEditing(false);
                      }}
                    >
                      {c.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>{leadText}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}

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
          title={`Company: ${editingCompany.name}`}
          size="lg"
          key={editingCompany.id}
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
                    Company
                  </Text>
                  {!companyCardEditing && (
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconPencil size={14} />}
                      onClick={() => {
                        setEditName(editingCompany.name);
                        setEditLeadIds(leadsForEdit.map((u) => u.id));
                        setCompanyCardEditing(true);
                      }}
                    >
                      Edit
                    </Button>
                  )}
                </Group>
                {companyCardEditing ? (
                  <Stack gap="md">
                    <TextInput
                      label="Name"
                      value={editName}
                      onChange={(e) => setEditName(e.currentTarget.value)}
                      required
                    />
                    <MultiSelect
                      label="Lead"
                      placeholder="Select company leads"
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
                        onClick={() => setCompanyCardEditing(false)}
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
                              if (name !== editingCompany.name) {
                                await updateCompany.mutateAsync({ id: editingCompany.id, name });
                              }
                              const currentIds = leadsForEdit.map((u) => u.id);
                              const toAdd = editLeadIds.filter((id) => !currentIds.includes(id));
                              const toRemove = currentIds.filter((id) => !editLeadIds.includes(id));
                              await Promise.all([
                                ...toAdd.map((userId) =>
                                  addLead.mutateAsync({ companyId: editingCompany.id, userId })
                                ),
                                ...toRemove.map((userId) =>
                                  removeLead.mutateAsync({ companyId: editingCompany.id, userId })
                                ),
                              ]);
                              setEditingCompany((prev) =>
                                prev && prev.id === editingCompany.id ? { ...prev, name } : prev
                              );
                              invalidateLeads(editingCompany.id);
                              setCompanyCardEditing(false);
                            } catch {
                              // notifications from mutations
                            }
                          })();
                        }}
                        loading={
                          updateCompany.isPending || addLead.isPending || removeLead.isPending
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
                      <Text size="sm">{editingCompany.name}</Text>
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
                {companyStatsPending ? (
                  <Loader size="sm" />
                ) : companyStatsData ? (
                  <Group gap="lg">
                    <div>
                      <Text size="xs" c="dimmed">
                        Storage
                      </Text>
                      <Text size="sm">{formatBytes(companyStatsData.storageBytesUsed)}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Departments
                      </Text>
                      <Text size="sm">{companyStatsData.departmentCount}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Teams
                      </Text>
                      <Text size="sm">{companyStatsData.teamCount}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Members
                      </Text>
                      <Text size="sm">{companyStatsData.memberCount}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Documents
                      </Text>
                      <Text size="sm">{companyStatsData.documentCount}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Processes
                      </Text>
                      <Text size="sm">{companyStatsData.processCount}</Text>
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">
                        Projects
                      </Text>
                      <Text size="sm">{companyStatsData.projectCount}</Text>
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
                  onClick={() => setDeleteConfirmCompany(editingCompany)}
                  loading={deleteCompany.isPending}
                >
                  Delete company
                </Button>
              </Card>
            </Tabs.Panel>
          </Tabs>
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
