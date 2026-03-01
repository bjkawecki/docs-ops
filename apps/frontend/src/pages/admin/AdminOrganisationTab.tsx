import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Stack,
  Title,
  Card,
  Group,
  Grid,
  Text,
  Loader,
  Modal,
  Menu,
  TextInput,
  List,
  ActionIcon,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconPencil, IconTrash, IconDotsVertical } from '@tabler/icons-react';
import { apiFetch } from '../../api/client';
import type { Company, Department, Team } from 'backend/api-types';

type CompaniesRes = { items: Company[]; total: number; limit: number; offset: number };
type DepartmentsRes = {
  items: (Department & { teams: Team[] })[];
  total: number;
  limit: number;
  offset: number;
};
type AssignmentListRes = {
  items: { id: string; name: string }[];
  total: number;
  limit: number;
  offset: number;
};
type AdminUsersRes = { items: { id: string; name: string; email: string | null }[]; total: number };

export function AdminOrganisationTab() {
  const queryClient = useQueryClient();
  const [createTeamForDepartmentId, setCreateTeamForDepartmentId] = useState<string | null>(null);

  const [companyModalOpened, { open: openCompanyModal, close: closeCompanyModal }] =
    useDisclosure(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  const [departmentModalOpened, { open: openDepartmentModal, close: closeDepartmentModal }] =
    useDisclosure(false);
  const [editingDepartment, setEditingDepartment] = useState<
    (Department & { teams?: Team[] }) | null
  >(null);

  const [teamModalOpened, { open: openTeamModal, close: closeTeamModal }] = useDisclosure(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [addSupervisorForDepartmentId, setAddSupervisorForDepartmentId] = useState<string | null>(
    null
  );

  const { data: companiesData, isPending: companiesPending } = useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<CompaniesRes> => {
      const res = await apiFetch('/api/v1/companies?limit=100');
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
  });

  const companies = companiesData?.items ?? [];
  const company = companies[0] ?? null;
  const companyId = company?.id ?? null;

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

  const { data: supervisorsDataForModal } = useQuery({
    queryKey: ['departments', addSupervisorForDepartmentId, 'supervisors'],
    queryFn: async (): Promise<AssignmentListRes> => {
      const res = await apiFetch(
        `/api/v1/departments/${addSupervisorForDepartmentId}/supervisors?limit=100`
      );
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    enabled: !!addSupervisorForDepartmentId,
  });
  const supervisorsForModal = supervisorsDataForModal?.items ?? [];

  const invalidateCompanies = () => queryClient.invalidateQueries({ queryKey: ['companies'] });
  const invalidateDepartments = () =>
    queryClient.invalidateQueries({ queryKey: ['companies', companyId, 'departments'] });
  const invalidateSupervisors = (departmentId: string) => {
    queryClient.invalidateQueries({ queryKey: ['departments', departmentId, 'supervisors'] });
  };

  const createCompany = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiFetch('/api/v1/companies', {
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
      invalidateCompanies();
      closeCompanyModal();
      setEditingCompany(null);
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
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateCompanies();
      closeCompanyModal();
      setEditingCompany(null);
      notifications.show({
        title: 'Company updated',
        message: 'The company has been updated.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const createDepartment = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiFetch(`/api/v1/companies/${companyId}/departments`, {
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
      closeDepartmentModal();
      setEditingDepartment(null);
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
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateDepartments();
      closeDepartmentModal();
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
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
    },
    onSuccess: () => {
      invalidateDepartments();
      notifications.show({
        title: 'Department deleted',
        message: 'The department has been deleted.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const createTeam = useMutation({
    mutationFn: async (name: string) => {
      if (!createTeamForDepartmentId) throw new Error('No department selected');
      const res = await apiFetch(`/api/v1/departments/${createTeamForDepartmentId}/teams`, {
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
      closeTeamModal();
      setEditingTeam(null);
      notifications.show({
        title: 'Team created',
        message: 'The team has been created.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const updateTeam = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiFetch(`/api/v1/teams/${id}`, {
        method: 'PATCH',
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
      closeTeamModal();
      setEditingTeam(null);
      notifications.show({
        title: 'Team updated',
        message: 'The team has been updated.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const deleteTeam = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/v1/teams/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
    },
    onSuccess: () => {
      invalidateDepartments();
      notifications.show({
        title: 'Team deleted',
        message: 'The team has been deleted.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const addSupervisor = useMutation({
    mutationFn: async ({ departmentId, userId }: { departmentId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/departments/${departmentId}/supervisors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
    },
    onSuccess: (_, { departmentId }) => {
      invalidateSupervisors(departmentId);
      setAddSupervisorForDepartmentId(null);
      notifications.show({
        title: 'Supervisor added',
        message: 'The supervisor has been added.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const removeSupervisor = useMutation({
    mutationFn: async ({ departmentId, userId }: { departmentId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/departments/${departmentId}/supervisors/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
    },
    onSuccess: (_, { departmentId }) => {
      invalidateSupervisors(departmentId);
      notifications.show({
        title: 'Supervisor removed',
        message: 'The supervisor has been removed.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const handleDeleteDepartment = (d: Department) => {
    if (
      window.confirm(
        `Really delete department "${d.name}"? Not possible when teams or dependencies exist.`
      )
    ) {
      deleteDepartment.mutate(d.id);
    }
  };
  const handleDeleteTeam = (t: Team) => {
    if (
      window.confirm(
        `Really delete team "${t.name}"? Not possible when processes or projects exist.`
      )
    ) {
      deleteTeam.mutate(t.id);
    }
  };

  return (
    <Box>
      {companiesPending ? (
        <Loader size="sm" />
      ) : (
        <Stack gap="sm">
          {companies.length === 0 ? (
            <>
              <Group>
                <Button
                  size="xs"
                  leftSection={<IconPlus size={14} />}
                  onClick={() => {
                    setEditingCompany(null);
                    openCompanyModal();
                  }}
                >
                  Create company
                </Button>
              </Group>
              <Text size="sm" c="dimmed">
                Only one company is allowed. Create the company, then manage departments and teams.
              </Text>
            </>
          ) : (
            <>
              <Group justify="space-between" align="center" mb="md">
                <Group gap="xs">
                  <Title order={4}>{company!.name}</Title>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    onClick={() => {
                      setEditingCompany(company!);
                      openCompanyModal();
                    }}
                  >
                    <IconPencil size={14} />
                  </ActionIcon>
                </Group>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={12} />}
                  onClick={() => {
                    setEditingDepartment(null);
                    openDepartmentModal();
                  }}
                >
                  Create department
                </Button>
              </Group>
              {departmentsPending ? (
                <Loader size="xs" />
              ) : departments.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No departments
                </Text>
              ) : (
                <Grid gutter="md">
                  {departments.map((d) => (
                    <Grid.Col key={d.id} span={{ base: 12, md: 6 }}>
                      <DepartmentCard
                        department={d}
                        onEditDepartment={() => {
                          setEditingDepartment(d);
                          openDepartmentModal();
                        }}
                        onDeleteDepartment={() => handleDeleteDepartment(d)}
                        onCreateTeam={() => {
                          setCreateTeamForDepartmentId(d.id);
                          setEditingTeam(null);
                          openTeamModal();
                        }}
                        onEditTeam={(t) => {
                          setEditingTeam(t);
                          openTeamModal();
                        }}
                        onDeleteTeam={handleDeleteTeam}
                        onAddSupervisor={() => setAddSupervisorForDepartmentId(d.id)}
                        onRemoveSupervisor={(userId) =>
                          removeSupervisor.mutate({ departmentId: d.id, userId })
                        }
                        deleteDepartmentIsPending={deleteDepartment.isPending}
                        deleteTeamIsPending={deleteTeam.isPending}
                        removeSupervisorIsPending={removeSupervisor.isPending}
                      />
                    </Grid.Col>
                  ))}
                </Grid>
              )}
            </>
          )}
        </Stack>
      )}

      <Modal
        opened={companyModalOpened}
        onClose={() => {
          closeCompanyModal();
          setEditingCompany(null);
        }}
        title={editingCompany ? 'Edit company' : 'Create company'}
        size="sm"
      >
        <CompanyForm
          initialName={editingCompany?.name ?? ''}
          onSubmit={(name) =>
            editingCompany
              ? updateCompany.mutate({ id: editingCompany.id, name })
              : createCompany.mutate(name)
          }
          onCancel={() => {
            closeCompanyModal();
            setEditingCompany(null);
          }}
          loading={createCompany.isPending || updateCompany.isPending}
        />
      </Modal>
      <Modal
        opened={departmentModalOpened}
        onClose={() => {
          closeDepartmentModal();
          setEditingDepartment(null);
        }}
        title={editingDepartment ? 'Edit department' : 'Create department'}
        size="sm"
      >
        <NameForm
          initialName={editingDepartment?.name ?? ''}
          onSubmit={(name) =>
            editingDepartment
              ? updateDepartment.mutate({ id: editingDepartment.id, name })
              : createDepartment.mutate(name)
          }
          onCancel={() => {
            closeDepartmentModal();
            setEditingDepartment(null);
          }}
          loading={createDepartment.isPending || updateDepartment.isPending}
        />
      </Modal>
      <Modal
        opened={teamModalOpened}
        onClose={() => {
          closeTeamModal();
          setEditingTeam(null);
          setCreateTeamForDepartmentId(null);
        }}
        title={editingTeam ? 'Edit team' : 'Create team'}
        size="sm"
      >
        <NameForm
          initialName={editingTeam?.name ?? ''}
          onSubmit={(name) =>
            editingTeam ? updateTeam.mutate({ id: editingTeam.id, name }) : createTeam.mutate(name)
          }
          onCancel={() => {
            closeTeamModal();
            setEditingTeam(null);
            setCreateTeamForDepartmentId(null);
          }}
          loading={createTeam.isPending || updateTeam.isPending}
        />
      </Modal>
      <UserPickerModal
        opened={!!addSupervisorForDepartmentId}
        onClose={() => setAddSupervisorForDepartmentId(null)}
        onSelect={(userId) =>
          addSupervisorForDepartmentId &&
          addSupervisor.mutate({ departmentId: addSupervisorForDepartmentId, userId })
        }
        excludeIds={supervisorsForModal.map((u) => u.id)}
        loading={addSupervisor.isPending}
      />
    </Box>
  );
}

type DepartmentWithTeams = Department & { teams?: Team[] };

function DepartmentCard({
  department,
  onEditDepartment,
  onDeleteDepartment,
  onCreateTeam,
  onEditTeam,
  onDeleteTeam,
  onAddSupervisor,
  onRemoveSupervisor,
  deleteDepartmentIsPending,
  deleteTeamIsPending,
  removeSupervisorIsPending,
}: {
  department: DepartmentWithTeams;
  onEditDepartment: () => void;
  onDeleteDepartment: () => void;
  onCreateTeam: () => void;
  onEditTeam: (team: Team) => void;
  onDeleteTeam: (team: Team) => void;
  onAddSupervisor: () => void;
  onRemoveSupervisor: (userId: string) => void;
  deleteDepartmentIsPending: boolean;
  deleteTeamIsPending: boolean;
  removeSupervisorIsPending: boolean;
}) {
  const { data: supervisorsData, isPending: supervisorsPending } = useQuery({
    queryKey: ['departments', department.id, 'supervisors'],
    queryFn: async (): Promise<AssignmentListRes> => {
      const res = await apiFetch(`/api/v1/departments/${department.id}/supervisors?limit=100`);
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    enabled: !!department.id,
  });
  const supervisors = supervisorsData?.items ?? [];
  const teams = department.teams ?? [];

  return (
    <Card withBorder padding="sm" mb="xs">
      <Group justify="space-between" align="center" mb="md">
        <Text fw={600} size="sm">
          {department.name}
        </Text>
        <Menu position="bottom-end" shadow="md">
          <Menu.Target>
            <ActionIcon size="sm" variant="subtle">
              <IconDotsVertical size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconPlus size={14} />} onClick={onCreateTeam}>
              Add team
            </Menu.Item>
            <Menu.Item leftSection={<IconPlus size={14} />} onClick={onAddSupervisor}>
              Add Supervisor
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item leftSection={<IconPencil size={14} />} onClick={onEditDepartment}>
              Edit department
            </Menu.Item>
            <Menu.Item
              leftSection={<IconTrash size={14} />}
              color="red"
              onClick={onDeleteDepartment}
              disabled={deleteDepartmentIsPending}
            >
              Delete department
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <Stack gap="sm">
        <Box>
          <Text size="xs" fw={600} mb="xs">
            Teams
          </Text>
          {teams.length === 0 ? (
            <Text size="xs" c="dimmed">
              No teams
            </Text>
          ) : (
            <List size="xs">
              {teams.map((t) => (
                <List.Item key={t.id}>
                  <Group justify="space-between" gap="xs">
                    <span>{t.name}</span>
                    <Group gap={4}>
                      <ActionIcon size="xs" variant="subtle" onClick={() => onEditTeam(t)}>
                        <IconPencil size={10} />
                      </ActionIcon>
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => onDeleteTeam(t)}
                        loading={deleteTeamIsPending}
                      >
                        <IconTrash size={10} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </List.Item>
              ))}
            </List>
          )}
        </Box>
        <Box>
          <Text size="xs" fw={600} mb="xs">
            Supervisors
          </Text>
          {supervisorsPending ? (
            <Loader size="xs" />
          ) : supervisors.length === 0 ? (
            <Text size="xs" c="dimmed">
              No supervisors
            </Text>
          ) : (
            <List size="xs">
              {supervisors.map((u) => (
                <List.Item key={u.id}>
                  <Group justify="space-between" gap="xs">
                    <span>{u.name}</span>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => onRemoveSupervisor(u.id)}
                      loading={removeSupervisorIsPending}
                    >
                      <IconTrash size={10} />
                    </ActionIcon>
                  </Group>
                </List.Item>
              ))}
            </List>
          )}
        </Box>
      </Stack>
    </Card>
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
  useEffect(() => {
    setName(initialName);
  }, [initialName]);
  return (
    <Stack>
      <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
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

function NameForm({
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
  useEffect(() => {
    setName(initialName);
  }, [initialName]);
  return (
    <Stack>
      <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
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
