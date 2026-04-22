import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Pagination,
  Stack,
  Table,
  Tabs,
  Text,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconLock, IconPencil, IconTrash } from '@tabler/icons-react';
import { apiFetch } from '../../../api/client';
import type {
  DepartmentWithTeams,
  UserDocumentsRes,
  UserRow,
  UserStatsRes,
} from './adminUsersTypes';
import { AdminUserAssignmentsDisplay } from './AdminUserAssignmentsDisplay';
import { AdminUserAssignmentsForm } from './AdminUserAssignmentsForm';
import { AdminUserProfileForm } from './AdminUserProfileForm';

type Props = {
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
};

export function AdminUserDetailTabs({
  user,
  departments,
  activeAdminCount,
  currentUserId,
  onSaveProfile,
  onResetPassword,
  onDeleteUser,
  onAssignmentsChange,
  updateUserPending,
}: Props) {
  const [documentsPage, setDocumentsPage] = useState(0);
  const [profileEditing, setProfileEditing] = useState(false);
  const [assignmentsEditing, setAssignmentsEditing] = useState(false);
  const DOCS_PAGE_SIZE = 10;
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
              <AdminUserProfileForm
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
              <AdminUserAssignmentsForm
                user={user}
                departments={departments}
                onSave={() => {
                  setAssignmentsEditing(false);
                  onAssignmentsChange();
                }}
                onCancel={() => setAssignmentsEditing(false)}
              />
            ) : (
              <AdminUserAssignmentsDisplay user={user} />
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
