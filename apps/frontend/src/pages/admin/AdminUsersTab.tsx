import { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Table,
  TextInput,
  Group,
  Loader,
  Alert,
  Modal,
  Stack,
  SegmentedControl,
  Badge,
  ActionIcon,
  Menu,
  Pagination,
  Switch,
  Select,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconDotsVertical,
  IconPencil,
  IconLock,
  IconUserOff,
  IconUserCheck,
  IconArrowUp,
  IconArrowDown,
  IconArrowsSort,
} from '@tabler/icons-react';
import { apiFetch } from '../../api/client';

export type UserRole = 'User' | 'Team leader' | 'Supervisor' | 'Admin';

type UserTeam = { id: string; name: string; departmentName: string };
type UserDepartment = { id: string; name: string };

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  role: UserRole;
  deletedAt: string | null;
  teams: UserTeam[];
  departments: UserDepartment[];
};

type ListUsersRes = { items: UserRow[]; total: number; limit: number; offset: number };
type DepartmentWithTeams = { id: string; name: string; teams: { id: string; name: string }[] };
type CompaniesRes = { items: { id: string }[] };
type DepartmentsRes = { items: DepartmentWithTeams[] };

const LIMIT = 20;

type SortByField = 'name' | 'email' | 'isAdmin' | 'deletedAt';
type SortOrder = 'asc' | 'desc';

function buildUsersQuery(params: {
  offset: number;
  includeDeactivated: boolean;
  search: string;
  sortBy: SortByField | null;
  sortOrder: SortOrder;
}) {
  const sp = new URLSearchParams();
  sp.set('limit', String(LIMIT));
  sp.set('offset', String(params.offset));
  if (params.includeDeactivated) sp.set('includeDeactivated', 'true');
  if (params.search.trim()) sp.set('search', params.search.trim());
  if (params.sortBy) {
    sp.set('sortBy', params.sortBy);
    sp.set('sortOrder', params.sortOrder);
  }
  return `/api/v1/admin/users?${sp.toString()}`;
}

function SortableTh({
  label,
  field,
  currentSortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  field: SortByField;
  currentSortBy: SortByField | null;
  sortOrder: SortOrder;
  onSort: () => void;
}) {
  const active = currentSortBy === field;
  return (
    <Table.Th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={onSort}>
      <Group gap={4} wrap="nowrap">
        {label}
        {active ? (
          sortOrder === 'asc' ? (
            <IconArrowUp size={14} />
          ) : (
            <IconArrowDown size={14} />
          )
        ) : (
          <IconArrowsSort size={14} style={{ opacity: 0.5 }} />
        )}
      </Group>
    </Table.Th>
  );
}

export function AdminUsersTab() {
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [includeDeactivated, setIncludeDeactivated] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState<SortByField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserRow | null>(null);

  const { data: companiesData } = useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<CompaniesRes> => {
      const res = await apiFetch('/api/v1/companies?limit=1');
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
  });
  const companyId = companiesData?.items?.[0]?.id ?? null;
  const { data: departmentsData } = useQuery({
    queryKey: ['companies', companyId, 'departments'],
    queryFn: async (): Promise<DepartmentsRes> => {
      const res = await apiFetch(`/api/v1/companies/${companyId}/departments?limit=100`);
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    enabled: !!companyId,
  });
  const departments = departmentsData?.items ?? [];

  const queryUrl = buildUsersQuery({ offset, includeDeactivated, search, sortBy, sortOrder });
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'users', offset, includeDeactivated, search, sortBy, sortOrder],
    queryFn: async (): Promise<ListUsersRes> => {
      const res = await apiFetch(queryUrl);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
  });

  const invalidateUsers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  }, [queryClient]);

  type CreateUserPayload = {
    name: string;
    email: string;
    password: string;
    isAdmin: boolean;
    departmentId?: string | null;
    teamId?: string | null;
    teamRole?: 'member' | 'leader';
    supervisorOfDepartment?: boolean;
  };
  const createUser = useMutation({
    mutationFn: async (body: CreateUserPayload) => {
      const { departmentId, teamId, teamRole, supervisorOfDepartment, ...userBody } = body;
      const res = await apiFetch('/api/v1/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userBody),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
      const user = (await res.json()) as { id: string };
      const userId = user.id;
      if (teamId) {
        const memberRes = await apiFetch(`/api/v1/teams/${teamId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        if (!memberRes.ok) {
          const err = await memberRes.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Failed to add team member');
        }
        if (teamRole === 'leader') {
          const leaderRes = await apiFetch(`/api/v1/teams/${teamId}/leaders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
          });
          if (!leaderRes.ok) {
            const err = await leaderRes.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error ?? 'Failed to add team leader');
          }
        }
      }
      if (departmentId && supervisorOfDepartment) {
        const supRes = await apiFetch(`/api/v1/departments/${departmentId}/supervisors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        if (!supRes.ok) {
          const err = await supRes.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Failed to add supervisor');
        }
      }
      return user;
    },
    onSuccess: () => {
      invalidateUsers();
      notifications.show({
        title: 'User created',
        message: 'The user has been created.',
        color: 'green',
      });
      closeCreate();
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Error', message: err.message, color: 'red' });
    },
  });

  const updateUser = useMutation({
    mutationFn: async ({
      userId,
      body,
    }: {
      userId: string;
      body: { name?: string; email?: string | null; isAdmin?: boolean; deletedAt?: string | null };
    }) => {
      const res = await apiFetch(`/api/v1/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateUsers();
      queryClient.invalidateQueries({ queryKey: ['me'] });
      notifications.show({
        title: 'User updated',
        message: 'The user has been updated.',
        color: 'green',
      });
      setEditUser(null);
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Error', message: err.message, color: 'red' });
    },
  });

  const resetPassword = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      const res = await apiFetch(`/api/v1/admin/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
    },
    onSuccess: () => {
      notifications.show({
        title: 'Password set',
        message: 'The password has been set.',
        color: 'green',
      });
      setResetPasswordUser(null);
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Error', message: err.message, color: 'red' });
    },
  });

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

  return (
    <Box>
      <Group mb="md" justify="space-between" wrap="wrap" gap="sm">
        <Group gap="sm" wrap="wrap">
          <SegmentedControl
            size="xs"
            data={[
              { label: 'Active', value: 'active' },
              { label: 'All', value: 'all' },
            ]}
            value={includeDeactivated ? 'all' : 'active'}
            onChange={(v) => {
              setIncludeDeactivated(v === 'all');
              setOffset(0);
            }}
          />
          <TextInput
            placeholder="Search (name, email)"
            size="xs"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearch(searchInput)}
          />
          <Button
            size="xs"
            variant="light"
            onClick={() => {
              setSearch(searchInput);
              setOffset(0);
            }}
          >
            Search
          </Button>
        </Group>
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={openCreate}>
          Create user
        </Button>
      </Group>

      {isPending && <Loader size="sm" />}
      {isError && (
        <Alert color="red" title="Error">
          {error?.message}
        </Alert>
      )}
      {data && !isPending && (
        <>
          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <SortableTh
                  label="Name"
                  currentSortBy={sortBy}
                  sortOrder={sortOrder}
                  field="name"
                  onSort={() => {
                    const next = sortBy === 'name' && sortOrder === 'asc' ? 'desc' : 'asc';
                    setSortBy('name');
                    setSortOrder(next);
                    setOffset(0);
                  }}
                />
                <SortableTh
                  label="Email"
                  currentSortBy={sortBy}
                  sortOrder={sortOrder}
                  field="email"
                  onSort={() => {
                    const next = sortBy === 'email' && sortOrder === 'asc' ? 'desc' : 'asc';
                    setSortBy('email');
                    setSortOrder(next);
                    setOffset(0);
                  }}
                />
                <SortableTh
                  label="Role"
                  currentSortBy={sortBy}
                  sortOrder={sortOrder}
                  field="isAdmin"
                  onSort={() => {
                    const next = sortBy === 'isAdmin' && sortOrder === 'asc' ? 'desc' : 'asc';
                    setSortBy('isAdmin');
                    setSortOrder(next);
                    setOffset(0);
                  }}
                />
                <Table.Th>Teams</Table.Th>
                <Table.Th>Departments</Table.Th>
                <SortableTh
                  label="Status"
                  currentSortBy={sortBy}
                  sortOrder={sortOrder}
                  field="deletedAt"
                  onSort={() => {
                    const next = sortBy === 'deletedAt' && sortOrder === 'asc' ? 'desc' : 'asc';
                    setSortBy('deletedAt');
                    setSortOrder(next);
                    setOffset(0);
                  }}
                />
                <Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.items.map((u) => (
                <Table.Tr key={u.id}>
                  <Table.Td>{u.name}</Table.Td>
                  <Table.Td>{u.email ?? '–'}</Table.Td>
                  <Table.Td>{u.role}</Table.Td>
                  <Table.Td>
                    {u.teams?.length ? u.teams.map((t) => t.name).join(', ') : '–'}
                  </Table.Td>
                  <Table.Td>
                    {u.departments?.length ? u.departments.map((d) => d.name).join(', ') : '–'}
                  </Table.Td>
                  <Table.Td>
                    {u.deletedAt ? (
                      <Badge size="sm" color="gray">
                        Deactivated
                      </Badge>
                    ) : (
                      <Badge size="sm" color="green">
                        Active
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Menu position="bottom-end">
                      <Menu.Target>
                        <ActionIcon variant="subtle" size="sm">
                          <IconDotsVertical size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconPencil size={14} />}
                          onClick={() => setEditUser(u)}
                        >
                          Edit
                        </Menu.Item>
                        <Menu.Item
                          leftSection={
                            u.deletedAt ? <IconUserCheck size={14} /> : <IconUserOff size={14} />
                          }
                          onClick={() =>
                            updateUser.mutate({
                              userId: u.id,
                              body: { deletedAt: u.deletedAt ? null : new Date().toISOString() },
                            })
                          }
                          disabled={updateUser.isPending}
                        >
                          {u.deletedAt ? 'Reactivate' : 'Deactivate'}
                        </Menu.Item>
                        {!u.deletedAt && (
                          <Menu.Item
                            leftSection={<IconLock size={14} />}
                            onClick={() => setResetPasswordUser(u)}
                          >
                            Set password
                          </Menu.Item>
                        )}
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {data.items.length === 0 && (
            <Alert color="gray" mt="sm">
              No users found.
            </Alert>
          )}
          {totalPages > 1 && (
            <Pagination
              total={totalPages}
              value={Math.floor(offset / LIMIT) + 1}
              onChange={(p) => setOffset((p - 1) * LIMIT)}
              mt="md"
              size="sm"
            />
          )}
        </>
      )}

      {/* Modal: Create user */}
      <Modal opened={createOpened} onClose={closeCreate} title="Create user" size="sm">
        <CreateUserForm
          departments={departments}
          onSubmit={(body) => createUser.mutate(body)}
          onCancel={closeCreate}
          isPending={createUser.isPending}
        />
      </Modal>

      {/* Modal: Edit user */}
      {editUser && (
        <Modal opened onClose={() => setEditUser(null)} title="Edit user" size="sm">
          <EditUserForm
            user={editUser}
            onSubmit={(body) => updateUser.mutate({ userId: editUser.id, body })}
            onCancel={() => setEditUser(null)}
            onDeactivate={
              !editUser.deletedAt
                ? () =>
                    updateUser.mutate({
                      userId: editUser.id,
                      body: { deletedAt: new Date().toISOString() },
                    })
                : undefined
            }
            onReactivate={
              editUser.deletedAt
                ? () => updateUser.mutate({ userId: editUser.id, body: { deletedAt: null } })
                : undefined
            }
            isPending={updateUser.isPending}
          />
        </Modal>
      )}

      {/* Modal: Set password */}
      {resetPasswordUser && (
        <Modal opened onClose={() => setResetPasswordUser(null)} title="Set password" size="sm">
          <ResetPasswordForm
            userName={resetPasswordUser.name}
            onSubmit={(newPassword) =>
              resetPassword.mutate({ userId: resetPasswordUser.id, newPassword })
            }
            onCancel={() => setResetPasswordUser(null)}
            isPending={resetPassword.isPending}
          />
        </Modal>
      )}
    </Box>
  );
}

function CreateUserForm({
  departments,
  onSubmit,
  onCancel,
  isPending,
}: {
  departments: DepartmentWithTeams[];
  onSubmit: (body: {
    name: string;
    email: string;
    password: string;
    isAdmin: boolean;
    departmentId?: string | null;
    teamId?: string | null;
    teamRole?: 'member' | 'leader';
    supervisorOfDepartment?: boolean;
  }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamRole, setTeamRole] = useState<'member' | 'leader'>('member');
  const [supervisorOfDepartment, setSupervisorOfDepartment] = useState(false);

  const selectedDepartment = departmentId ? departments.find((d) => d.id === departmentId) : null;
  const teamOptions = (selectedDepartment?.teams ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }));
  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.name }));

  const handleSubmit = () => {
    onSubmit({
      name,
      email,
      password,
      isAdmin,
      departmentId: departmentId || undefined,
      teamId: teamId || undefined,
      teamRole: teamId ? teamRole : undefined,
      supervisorOfDepartment: departmentId ? supervisorOfDepartment : false,
    });
  };

  return (
    <Stack>
      <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextInput
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <TextInput
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
      />
      <Switch
        label="Administrator"
        checked={isAdmin}
        onChange={(e) => setIsAdmin(e.currentTarget.checked)}
      />
      <Select
        label="Department"
        placeholder="Optional"
        data={departmentOptions}
        value={departmentId}
        onChange={(v) => {
          setDepartmentId(v);
          setTeamId(null);
        }}
        clearable
      />
      <Select
        label="Team"
        placeholder={departmentId ? 'Optional' : 'Select department first'}
        data={teamOptions}
        value={teamId}
        onChange={setTeamId}
        disabled={!departmentId}
        clearable
      />
      {teamId && (
        <Select
          label="Role in team"
          data={[
            { value: 'member', label: 'Member' },
            { value: 'leader', label: 'Team leader' },
          ]}
          value={teamRole}
          onChange={(v) => v && setTeamRole(v as 'member' | 'leader')}
        />
      )}
      {departmentId && (
        <Switch
          label="Supervisor of this department"
          checked={supervisorOfDepartment}
          onChange={(e) => setSupervisorOfDepartment(e.currentTarget.checked)}
        />
      )}
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          loading={isPending}
          disabled={!name.trim() || !email.trim() || password.length < 8}
        >
          Create
        </Button>
      </Group>
    </Stack>
  );
}

function EditUserForm({
  user,
  onSubmit,
  onCancel,
  onDeactivate,
  onReactivate,
  isPending,
}: {
  user: UserRow;
  onSubmit: (body: { name?: string; email?: string | null; isAdmin?: boolean }) => void;
  onCancel: () => void;
  onDeactivate?: () => void;
  onReactivate?: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? '');
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);

  return (
    <Stack>
      <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextInput
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Switch
        label="Administrator"
        checked={isAdmin}
        onChange={(e) => setIsAdmin(e.currentTarget.checked)}
      />
      <Group justify="space-between" mt="md">
        <Group>
          {onDeactivate && (
            <Button
              variant="light"
              color="red"
              size="xs"
              onClick={onDeactivate}
              loading={isPending}
            >
              Deactivate
            </Button>
          )}
          {onReactivate && (
            <Button
              variant="light"
              color="green"
              size="xs"
              onClick={onReactivate}
              loading={isPending}
            >
              Reactivate
            </Button>
          )}
        </Group>
        <Group>
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({ name, email: email.trim() || null, isAdmin })}
            loading={isPending}
            disabled={!name.trim()}
          >
            Save
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

function ResetPasswordForm({
  onSubmit,
  onCancel,
  isPending,
}: {
  userName: string;
  onSubmit: (newPassword: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const valid = password.length >= 8 && password === confirm;

  return (
    <Stack>
      <TextInput
        label="New password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
      />
      <TextInput
        label="Confirm password"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={confirm && password !== confirm ? 'Does not match' : undefined}
      />
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSubmit(password)} loading={isPending} disabled={!valid}>
          Set
        </Button>
      </Group>
    </Stack>
  );
}
