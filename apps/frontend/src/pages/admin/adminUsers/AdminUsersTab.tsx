import { useState, useCallback, useEffect } from 'react';
import { Box, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../../api/client';
import { meQueryKey, useMe } from '../../../hooks/useMe';
import { AdminUserCreateForm } from './AdminUserCreateForm';
import { AdminUserDetailTabs } from './AdminUserDetailTabs';
import { AdminUsersList } from './AdminUsersList';
import { buildUsersQuery } from './buildUsersQuery';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, USERS_PAGE_SIZE_KEY } from './adminUsersConstants';
import type {
  CompaniesRes,
  CreateUserPayload,
  DepartmentsRes,
  ListUsersRes,
  SortByField,
  SortOrder,
  UserRow,
} from './adminUsersTypes';

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
      notifications.show({
        title: 'User deleted',
        message: 'The user was removed.',
        color: 'green',
      });
      setDeleteUserConfirmUser(null);
      setDetailUser(null);
      invalidateUsers();
    },
    onError: (err: Error) => {
      notifications.show({ title: 'Error', message: err.message, color: 'red' });
    },
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  const handleSortColumn = (field: SortByField) => {
    const next = sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortBy(field);
    setSortOrder(next);
    setOffset(0);
  };

  const listError = error instanceof Error ? error : error ? new Error(String(error)) : null;

  return (
    <Box>
      <AdminUsersList
        includeDeactivated={includeDeactivated}
        onIncludeDeactivatedChange={(v) => {
          setIncludeDeactivated(v);
          setOffset(0);
        }}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        onSearchSubmit={() => {
          setSearch(searchInput);
          setOffset(0);
        }}
        limit={limit}
        onLimitChange={(next) => {
          setLimit(next);
          setOffset(0);
          try {
            window.localStorage.setItem(USERS_PAGE_SIZE_KEY, String(next));
          } catch {
            /* ignore */
          }
        }}
        onOpenCreate={openCreate}
        isPending={isPending}
        isError={isError}
        error={listError}
        data={data}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortColumn={handleSortColumn}
        offset={offset}
        totalPages={totalPages}
        onPageChange={(p) => setOffset((p - 1) * limit)}
        onEmailClick={setDetailUser}
      />

      {detailUser && (
        <Modal
          opened
          onClose={() => setDetailUser(null)}
          title={`User: ${detailUser.name}`}
          size="lg"
        >
          <AdminUserDetailTabs
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

      <Modal opened={createOpened} onClose={closeCreate} title="Create user" size="sm">
        <AdminUserCreateForm
          departments={departments}
          onSubmit={(body) => createUser.mutate(body)}
          onCancel={closeCreate}
          isPending={createUser.isPending}
        />
      </Modal>

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
