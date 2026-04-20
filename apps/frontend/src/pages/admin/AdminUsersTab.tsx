import { useState, useCallback, useEffect } from 'react';
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
  Pagination,
  Switch,
  Select,
  Tabs,
  Card,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconPencil,
  IconLock,
  IconTrash,
  IconArrowUp,
  IconArrowDown,
  IconArrowsSort,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api/client';
import { meQueryKey, useMe } from '../../hooks/useMe';

export type UserRole = 'User' | 'Team Lead' | 'Department Lead' | 'Company Lead' | 'Admin';

type UserTeam = { id: string; name: string; departmentName: string; isLead?: boolean };
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
  departmentsAsLead?: UserDepartment[];
};

type ListUsersRes = {
  items: UserRow[];
  total: number;
  limit: number;
  offset: number;
  activeAdminCount: number;
};
type DepartmentWithTeams = { id: string; name: string; teams: { id: string; name: string }[] };
type CompaniesRes = { items: { id: string }[] };
type DepartmentsRes = { items: DepartmentWithTeams[] };

const USERS_PAGE_SIZE_KEY = 'docsops-admin-users-page-size';
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;

type SortByField = 'name' | 'email' | 'isAdmin' | 'deletedAt' | 'role' | 'teams' | 'departments';
type SortOrder = 'asc' | 'desc';

function buildUsersQuery(params: {
  limit: number;
  offset: number;
  includeDeactivated: boolean;
  search: string;
  sortBy: SortByField | null;
  sortOrder: SortOrder;
}) {
  const sp = new URLSearchParams();
  sp.set('limit', String(params.limit));
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
  const [limit, setLimit] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem(USERS_PAGE_SIZE_KEY);
      if (!raw) return DEFAULT_PAGE_SIZE;
      const parsed = Number(raw);
      return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])
        ? parsed
        : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [includeDeactivated, setIncludeDeactivated] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState<SortByField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [detailUser, setDetailUser] = useState<UserRow | null>(null);
  const [resetPasswordConfirmUser, setResetPasswordConfirmUser] = useState<UserRow | null>(null);
  const [deleteUserConfirmUser, setDeleteUserConfirmUser] = useState<UserRow | null>(null);

  const { data: meData } = useMe();
  const currentUserId = meData?.impersonation?.realUser?.id ?? meData?.user?.id ?? null;

  const { data: companiesData } = useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<CompaniesRes> => {
      const res = await apiFetch('/api/v1/companies?limit=1');
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
  const departments = departmentsData?.items ?? [];

  const queryUrl = buildUsersQuery({
    limit,
    offset,
    includeDeactivated,
    search,
    sortBy,
    sortOrder,
  });
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'users', limit, offset, includeDeactivated, search, sortBy, sortOrder],
    queryFn: async (): Promise<ListUsersRes> => {
      const res = await apiFetch(queryUrl);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as ListUsersRes;
    },
  });

  useEffect(() => {
    if (detailUser && data?.items) {
      const updated = data.items.find((u) => u.id === detailUser.id);
      if (updated) setDetailUser(updated);
    }
  }, [data?.items, detailUser]);

  const invalidateUsers = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
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
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
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
          const memberErr = (await memberRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(memberErr.error ?? 'Failed to add team member');
        }
        if (teamRole === 'leader') {
          const leaderRes = await apiFetch(`/api/v1/teams/${teamId}/team-leads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
          });
          if (!leaderRes.ok) {
            const leaderErr = (await leaderRes.json().catch(() => ({}))) as { error?: string };
            throw new Error(leaderErr.error ?? 'Failed to add team lead');
          }
        }
      }
      if (departmentId && supervisorOfDepartment) {
        const supRes = await apiFetch(`/api/v1/departments/${departmentId}/department-leads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        if (!supRes.ok) {
          const supErr = (await supRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(supErr.error ?? 'Failed to add department lead');
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
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as UserRow;
    },
    onSuccess: () => {
      invalidateUsers();
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
      notifications.show({
        title: 'User updated',
        message: 'The user has been updated.',
        color: 'green',
      });
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Error', message: err.message, color: 'red' });
    },
  });

  const resetPasswordTrigger = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/v1/admin/users/${userId}/reset-password/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: () => {
      notifications.show({
        title: 'Password reset triggered',
        message: 'The user will need to set a new password.',
        color: 'green',
      });
      setResetPasswordConfirmUser(null);
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Error', message: err.message, color: 'red' });
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiFetch(`/api/v1/admin/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: () => {
      notifications.show({ title: 'User deleted', color: 'green' });
      setDeleteUserConfirmUser(null);
      setDetailUser(null);
      invalidateUsers();
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Error', message: err.message, color: 'red' });
    },
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <Box>
      <Group mb="md" justify="space-between" wrap="wrap" gap="sm">
        <Group gap="sm" wrap="wrap">
          <SegmentedControl
            size="xs"
            data={[
              { label: 'All', value: 'all' },
              { label: 'Active', value: 'active' },
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
        <Group gap="sm" align="flex-end">
          <Text size="sm" c="dimmed">
            {data?.total ?? 0} user(s)
          </Text>
          <Select
            label="Per page"
            data={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
            value={String(limit)}
            onChange={(value) => {
              const next = Number(value ?? DEFAULT_PAGE_SIZE);
              setLimit(next);
              setOffset(0);
              try {
                window.localStorage.setItem(USERS_PAGE_SIZE_KEY, String(next));
              } catch {
                /* ignore */
              }
            }}
            style={{ width: 100 }}
          />
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={openCreate}>
            Create user
          </Button>
        </Group>
      </Group>

      {isPending && <Loader size="sm" />}
      {isError && (
        <Alert color="red" title="Error">
          {error?.message}
        </Alert>
      )}
      {data && !isPending && (
        <>
          <Table withTableBorder withColumnBorders className="admin-table-hover">
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
                  field="role"
                  onSort={() => {
                    const next = sortBy === 'role' && sortOrder === 'asc' ? 'desc' : 'asc';
                    setSortBy('role');
                    setSortOrder(next);
                    setOffset(0);
                  }}
                />
                <SortableTh
                  label="Teams"
                  currentSortBy={sortBy}
                  sortOrder={sortOrder}
                  field="teams"
                  onSort={() => {
                    const next = sortBy === 'teams' && sortOrder === 'asc' ? 'desc' : 'asc';
                    setSortBy('teams');
                    setSortOrder(next);
                    setOffset(0);
                  }}
                />
                <SortableTh
                  label="Departments"
                  currentSortBy={sortBy}
                  sortOrder={sortOrder}
                  field="departments"
                  onSort={() => {
                    const next = sortBy === 'departments' && sortOrder === 'asc' ? 'desc' : 'asc';
                    setSortBy('departments');
                    setSortOrder(next);
                    setOffset(0);
                  }}
                />
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
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.items.map((u) => (
                <Table.Tr key={u.id}>
                  <Table.Td>{u.name}</Table.Td>
                  <Table.Td>
                    {u.email ? (
                      <Text
                        component="button"
                        type="button"
                        variant="link"
                        c="var(--mantine-primary-color-4)"
                        size="sm"
                        className="admin-link-hover"
                        style={{
                          cursor: 'pointer',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                        }}
                        onClick={() => setDetailUser(u)}
                      >
                        {u.email}
                      </Text>
                    ) : (
                      '–'
                    )}
                  </Table.Td>
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
              value={Math.floor(offset / limit) + 1}
              onChange={(p) => setOffset((p - 1) * limit)}
              mt="md"
              size="sm"
            />
          )}
        </>
      )}

      {/* Modal: User detail (tabs: Overview, Documents) */}
      {detailUser && (
        <Modal
          opened
          onClose={() => setDetailUser(null)}
          title={`User: ${detailUser.name}`}
          size="lg"
        >
          <UserDetailTabs
            user={detailUser}
            departments={departments}
            activeAdminCount={data?.activeAdminCount}
            currentUserId={currentUserId}
            onDeleteUser={() => setDeleteUserConfirmUser(detailUser)}
            onSaveProfile={async (body) => {
              await updateUser.mutateAsync({
                userId: detailUser.id,
                body: {
                  name: body.name,
                  email: body.email,
                  isAdmin: body.isAdmin,
                  deletedAt: body.deletedAt,
                },
              });
              if (companyId && typeof body.isCompanyLead === 'boolean') {
                const wasCompanyLead = detailUser.role === 'Company Lead';
                if (body.isCompanyLead && !wasCompanyLead) {
                  const res = await apiFetch(`/api/v1/companies/${companyId}/company-leads`, {
                    method: 'POST',
                    body: JSON.stringify({ userId: detailUser.id }),
                  });
                  if (!res.ok) {
                    const err = (await res.json().catch(() => ({}))) as { error?: string };
                    throw new Error(err.error ?? res.statusText);
                  }
                } else if (!body.isCompanyLead && wasCompanyLead) {
                  const res = await apiFetch(
                    `/api/v1/companies/${companyId}/company-leads/${detailUser.id}`,
                    { method: 'DELETE' }
                  );
                  if (!res.ok) {
                    const err = (await res.json().catch(() => ({}))) as { error?: string };
                    throw new Error(err.error ?? res.statusText);
                  }
                }
              }
              invalidateUsers();
            }}
            onResetPassword={() => setResetPasswordConfirmUser(detailUser)}
            onAssignmentsChange={invalidateUsers}
            updateUserPending={updateUser.isPending}
          />
        </Modal>
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

      {/* Modal: Reset password confirmation */}
      {resetPasswordConfirmUser && (
        <Modal
          opened
          onClose={() => setResetPasswordConfirmUser(null)}
          title="Reset password"
          size="sm"
        >
          <Stack gap="md">
            <Text size="sm">
              Trigger a password reset for {resetPasswordConfirmUser.name}? They will need to set a
              new password (e.g. via email link or on next login).
            </Text>
            <Group justify="flex-end" gap="xs">
              <Button variant="default" onClick={() => setResetPasswordConfirmUser(null)}>
                Cancel
              </Button>
              <Button
                color="red"
                onClick={() =>
                  resetPasswordTrigger.mutate(resetPasswordConfirmUser.id, {
                    onSuccess: () => setResetPasswordConfirmUser(null),
                  })
                }
                loading={resetPasswordTrigger.isPending}
              >
                Reset password
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}

      {/* Modal: Delete user confirmation */}
      {deleteUserConfirmUser && (
        <Modal opened onClose={() => setDeleteUserConfirmUser(null)} title="Delete user" size="sm">
          <Stack gap="md">
            <Text size="sm">
              Permanently delete {deleteUserConfirmUser.name}? This cannot be undone. All associated
              data (contexts, documents, assignments) will be removed.
            </Text>
            <Group justify="flex-end" gap="xs">
              <Button variant="default" onClick={() => setDeleteUserConfirmUser(null)}>
                Cancel
              </Button>
              <Button
                color="red"
                onClick={() => deleteUser.mutate(deleteUserConfirmUser.id)}
                loading={deleteUser.isPending}
              >
                Delete user
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </Box>
  );
}

type UserStatsRes = {
  storageBytesUsed: number;
  documentsAsWriterCount: number;
  draftsCount: number;
};
type UserDocumentsRes = {
  items: { id: string; title: string }[];
  total: number;
  limit: number;
  offset: number;
};

function ProfileCardForm({
  user,
  onSave,
  onCancel,
  isPending,
  isLastActiveAdmin,
}: {
  user: UserRow;
  onSave: (body: {
    name: string;
    email: string | null;
    isAdmin: boolean;
    isCompanyLead: boolean;
    deletedAt: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
  isLastActiveAdmin?: boolean;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? '');
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);
  const [isCompanyLead, setIsCompanyLead] = useState(user.role === 'Company Lead');
  const [deactivated, setDeactivated] = useState(!!user.deletedAt);

  const handleSubmit = () => {
    onSave({
      name: name.trim(),
      email: email.trim() || null,
      isAdmin,
      isCompanyLead,
      deletedAt: deactivated ? new Date().toISOString() : null,
    }).catch(() => {});
  };

  return (
    <Stack gap="sm">
      <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextInput
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Switch
        label="Administrator"
        description={
          isLastActiveAdmin ? 'At least one active administrator is required.' : undefined
        }
        checked={isAdmin}
        onChange={(e) => setIsAdmin(e.currentTarget.checked)}
        disabled={isLastActiveAdmin}
      />
      <Switch
        label="Company lead"
        checked={isCompanyLead}
        onChange={(e) => setIsCompanyLead(e.currentTarget.checked)}
      />
      <Switch
        label="Deactivated"
        description={
          isLastActiveAdmin ? 'The last administrator cannot be deactivated.' : undefined
        }
        checked={deactivated}
        onChange={(e) => setDeactivated(e.currentTarget.checked)}
        disabled={isLastActiveAdmin}
      />
      <Group gap="xs" mt="xs">
        <Button size="sm" variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} loading={isPending} disabled={!name.trim()}>
          Save
        </Button>
      </Group>
    </Stack>
  );
}

function UserDetailTabs({
  user,
  departments,
  activeAdminCount,
  currentUserId,
  onSaveProfile,
  onResetPassword,
  onDeleteUser,
  onAssignmentsChange,
  updateUserPending,
}: {
  user: UserRow;
  departments: DepartmentWithTeams[];
  activeAdminCount: number | undefined;
  currentUserId: string | null;
  onSaveProfile: (body: {
    name: string;
    email: string | null;
    isAdmin: boolean;
    isCompanyLead: boolean;
    deletedAt: string | null;
  }) => Promise<void>;
  onResetPassword: () => void;
  onDeleteUser: () => void;
  onAssignmentsChange: () => void;
  updateUserPending: boolean;
}) {
  const [documentsPage, setDocumentsPage] = useState(0);
  const [profileEditing, setProfileEditing] = useState(false);
  const [assignmentsEditing, setAssignmentsEditing] = useState(false);
  const DOCS_PAGE_SIZE = 20;
  const isLastActiveAdmin = activeAdminCount === 1 && !!user.isAdmin && !user.deletedAt;

  const { data: statsData, isPending: statsPending } = useQuery({
    queryKey: ['admin', 'users', user.id, 'stats'],
    queryFn: async (): Promise<UserStatsRes> => {
      const res = await apiFetch(`/api/v1/admin/users/${user.id}/stats`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as UserStatsRes;
    },
    enabled: !!user.id,
  });

  const { data: docsData, isPending: docsPending } = useQuery({
    queryKey: ['admin', 'users', user.id, 'documents', documentsPage],
    queryFn: async (): Promise<UserDocumentsRes> => {
      const res = await apiFetch(
        `/api/v1/admin/users/${user.id}/documents?limit=${DOCS_PAGE_SIZE}&offset=${documentsPage * DOCS_PAGE_SIZE}`
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as UserDocumentsRes;
    },
    enabled: !!user.id,
  });

  const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Tabs defaultValue="details">
      <Tabs.List>
        <Tabs.Tab value="details">Overview</Tabs.Tab>
        <Tabs.Tab value="documents">Documents</Tabs.Tab>
        <Tabs.Tab value="danger">Account</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="details" pt="md">
        <Stack gap="md">
          <Card withBorder padding="md">
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={600}>
                Profile
              </Text>
              {!profileEditing && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPencil size={14} />}
                  onClick={() => setProfileEditing(true)}
                >
                  Edit
                </Button>
              )}
            </Group>
            {profileEditing ? (
              <ProfileCardForm
                user={user}
                onSave={async (body) => {
                  await onSaveProfile(body);
                  setProfileEditing(false);
                }}
                onCancel={() => setProfileEditing(false)}
                isPending={updateUserPending}
                isLastActiveAdmin={isLastActiveAdmin}
              />
            ) : (
              <Stack gap="xs">
                <div>
                  <Text size="xs" c="dimmed">
                    Name
                  </Text>
                  <Text size="sm">{user.name}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Email
                  </Text>
                  <Text size="sm">{user.email ?? '–'}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Status
                  </Text>
                  <Group gap="xs" mt={4}>
                    {user.deletedAt ? (
                      <Badge size="sm" color="gray">
                        Deactivated
                      </Badge>
                    ) : (
                      <Badge size="sm" color="green">
                        Active
                      </Badge>
                    )}
                    {user.role === 'Company Lead' && (
                      <Badge size="sm" color="violet" variant="filled">
                        Company lead
                      </Badge>
                    )}
                    {user.isAdmin && (
                      <Badge size="sm" color="blue" variant="filled">
                        Admin
                      </Badge>
                    )}
                  </Group>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    User ID
                  </Text>
                  <Text size="sm" style={{ wordBreak: 'break-all' }}>
                    {user.id}
                  </Text>
                </div>
              </Stack>
            )}
          </Card>
          <Card withBorder padding="md">
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={600}>
                Assignments
              </Text>
              {!assignmentsEditing && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPencil size={14} />}
                  onClick={() => setAssignmentsEditing(true)}
                >
                  Edit
                </Button>
              )}
            </Group>
            {assignmentsEditing ? (
              <AssignmentsCardForm
                user={user}
                departments={departments}
                onSave={() => {
                  setAssignmentsEditing(false);
                  onAssignmentsChange();
                }}
                onCancel={() => setAssignmentsEditing(false)}
              />
            ) : (
              <AssignmentsCardDisplay user={user} />
            )}
          </Card>
          <Card withBorder padding="md">
            <Text size="sm" fw={600} mb="xs">
              Usage
            </Text>
            {statsPending ? (
              <Loader size="sm" />
            ) : statsData ? (
              <Group gap="lg">
                <div>
                  <Text size="xs" c="dimmed">
                    Storage
                  </Text>
                  <Text size="sm">{formatBytes(statsData.storageBytesUsed)}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Authored
                  </Text>
                  <Text size="sm">{statsData.documentsAsWriterCount}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Drafts
                  </Text>
                  <Text size="sm">{statsData.draftsCount}</Text>
                </div>
              </Group>
            ) : null}
          </Card>
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="danger" pt="md">
        <Card withBorder padding="md">
          <Text size="sm" fw={600} mb="xs">
            Account
          </Text>
          <Text size="xs" c="dimmed" mb="md">
            Sensitive account actions. Use with care.
          </Text>
          <Stack gap="md">
            {!user.deletedAt && (
              <Group align="center" gap="sm">
                <Button
                  size="sm"
                  variant="light"
                  color="orange"
                  leftSection={<IconLock size={14} />}
                  onClick={onResetPassword}
                >
                  Reset password
                </Button>
                <Text size="xs" c="dimmed">
                  Trigger a password reset. The user will need to set a new password.
                </Text>
              </Group>
            )}
            <Group align="center" gap="sm">
              <Button
                size="sm"
                variant="light"
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={onDeleteUser}
                disabled={currentUserId === user.id}
              >
                Delete user
              </Button>
              <Text size="xs" c="dimmed">
                {currentUserId === user.id
                  ? 'You cannot delete your own account.'
                  : 'Permanently delete this user and all associated data. This cannot be undone.'}
              </Text>
            </Group>
          </Stack>
        </Card>
      </Tabs.Panel>

      <Tabs.Panel value="documents" pt="md">
        {docsPending ? (
          <Loader size="sm" />
        ) : docsData ? (
          <Stack gap="sm">
            {docsData.items.length === 0 ? (
              <Text size="sm" c="dimmed">
                No documents (user is not a writer).
              </Text>
            ) : (
              <>
                <Table withTableBorder withColumnBorders className="admin-table-hover">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Title</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {docsData.items.map((d) => (
                      <Table.Tr key={d.id}>
                        <Table.Td>
                          <Text component={Link} to={`/documents/${d.id}`} size="sm">
                            {d.title}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
                {docsData.total > DOCS_PAGE_SIZE && (
                  <Pagination
                    total={Math.ceil(docsData.total / DOCS_PAGE_SIZE)}
                    value={documentsPage + 1}
                    onChange={(p) => setDocumentsPage(p - 1)}
                    size="sm"
                  />
                )}
              </>
            )}
          </Stack>
        ) : null}
      </Tabs.Panel>
    </Tabs>
  );
}

function AssignmentsCardDisplay({ user }: { user: UserRow }) {
  const team = user.teams?.[0];
  const deptLead = user.departmentsAsLead?.[0];
  const departmentName = deptLead?.name ?? team?.departmentName ?? '–';
  const departmentRole = deptLead ? 'Lead' : team ? 'Member' : '–';

  const teamRole = team ? (team.isLead ? 'Lead' : 'Member') : '–';

  return (
    <Stack gap="xs">
      <Group justify="flex-start" wrap="nowrap" gap="xl" align="flex-start">
        <div style={{ minWidth: 140 }}>
          <Text size="xs" c="dimmed">
            Department
          </Text>
          <Text size="sm">{departmentName}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            Role
          </Text>
          <Text size="sm">{departmentRole}</Text>
        </div>
      </Group>
      <Group justify="flex-start" wrap="nowrap" gap="xl" align="flex-start">
        <div style={{ minWidth: 140 }}>
          <Text size="xs" c="dimmed">
            Team
          </Text>
          <Text size="sm">{team?.name ?? '–'}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            Role
          </Text>
          <Text size="sm">{teamRole}</Text>
        </div>
      </Group>
    </Stack>
  );
}

function AssignmentsCardForm({
  user,
  departments,
  onSave,
  onCancel,
}: {
  user: UserRow;
  departments: DepartmentWithTeams[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const allTeams = departments.flatMap((d) =>
    (d.teams ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      departmentId: d.id,
      departmentName: d.name,
    }))
  );
  const currentTeam = user.teams?.[0];
  const currentDeptLead = user.departmentsAsLead?.[0];

  const [teamId, setTeamId] = useState(currentTeam?.id ?? '');
  const [teamRole, setTeamRole] = useState<'Member' | 'Lead'>(
    currentTeam?.isLead ? 'Lead' : 'Member'
  );
  const [departmentLeadId, setDepartmentLeadId] = useState(currentDeptLead?.id ?? '');

  const removeFromTeam = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await apiFetch(`/api/v1/teams/${teamId}/members/${user.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const addToTeam = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await apiFetch(`/api/v1/teams/${teamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const addTeamLead = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await apiFetch(`/api/v1/teams/${teamId}/team-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const removeTeamLead = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await apiFetch(`/api/v1/teams/${teamId}/team-leads/${user.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const addDepartmentLead = useMutation({
    mutationFn: async (departmentId: string) => {
      const res = await apiFetch(`/api/v1/departments/${departmentId}/department-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const removeDepartmentLead = useMutation({
    mutationFn: async (departmentId: string) => {
      const res = await apiFetch(
        `/api/v1/departments/${departmentId}/department-leads/${user.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const isPending =
    removeFromTeam.isPending ||
    addToTeam.isPending ||
    addTeamLead.isPending ||
    removeTeamLead.isPending ||
    addDepartmentLead.isPending ||
    removeDepartmentLead.isPending;

  const handleSave = async () => {
    try {
      for (const t of user.teams ?? []) {
        if (t.id !== teamId) await removeFromTeam.mutateAsync(t.id);
      }
      if (teamId && !user.teams?.some((t) => t.id === teamId)) {
        await addToTeam.mutateAsync(teamId);
      }
      if (teamId) {
        const wantLead = teamRole === 'Lead';
        const current = user.teams?.find((t) => t.id === teamId)?.isLead ?? false;
        if (wantLead && !current) await addTeamLead.mutateAsync(teamId);
        if (!wantLead && current) await removeTeamLead.mutateAsync(teamId);
      }
      for (const d of user.departmentsAsLead ?? []) {
        if (d.id !== departmentLeadId) await removeDepartmentLead.mutateAsync(d.id);
      }
      if (departmentLeadId && !user.departmentsAsLead?.some((d) => d.id === departmentLeadId)) {
        await addDepartmentLead.mutateAsync(departmentLeadId);
      }
      notifications.show({ title: 'Assignments updated', color: 'green' });
      onSave();
    } catch {
      // errors already shown
    }
  };

  const teamOptions = allTeams.map((t) => ({
    value: t.id,
    label: `${t.name} (${t.departmentName})`,
  }));

  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.name }));

  return (
    <Stack gap="sm">
      <Select
        label="Team"
        placeholder="Select team"
        data={teamOptions}
        value={teamId || null}
        onChange={(v) => setTeamId(v ?? '')}
        clearable
        size="sm"
      />
      <Select
        label="Team role"
        data={[
          { value: 'Member', label: 'Member' },
          { value: 'Lead', label: 'Lead' },
        ]}
        value={teamRole}
        onChange={(v) => v && setTeamRole(v as 'Member' | 'Lead')}
        size="sm"
      />
      <Select
        label="Department (lead)"
        placeholder="None"
        description="Department where this user is department lead (optional)"
        data={departmentOptions}
        value={departmentLeadId || null}
        onChange={(v) => setDepartmentLeadId(v ?? '')}
        clearable
        size="sm"
      />
      <Group gap="xs" mt="xs">
        <Button size="sm" variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void handleSave()} loading={isPending} disabled={!teamId}>
          Save
        </Button>
      </Group>
    </Stack>
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
            { value: 'leader', label: 'Team Lead' },
          ]}
          value={teamRole}
          onChange={(v) => v && setTeamRole(v as 'member' | 'leader')}
        />
      )}
      {departmentId && (
        <Switch
          label="Department Lead of this department"
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
