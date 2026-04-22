import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Pagination,
  SegmentedControl,
  Select,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { AdminUsersSortableTh } from './AdminUsersSortableTh';
import type { ListUsersRes, SortByField, SortOrder, UserRow } from './adminUsersTypes';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from './adminUsersConstants';

type Props = {
  includeDeactivated: boolean;
  onIncludeDeactivatedChange: (value: boolean) => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onSearchSubmit: () => void;
  limit: number;
  onLimitChange: (next: number) => void;
  onOpenCreate: () => void;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  data: ListUsersRes | undefined;
  sortBy: SortByField | null;
  sortOrder: SortOrder;
  onSortColumn: (field: SortByField) => void;
  offset: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onEmailClick: (user: UserRow) => void;
};

export function AdminUsersList({
  includeDeactivated,
  onIncludeDeactivatedChange,
  searchInput,
  onSearchInputChange,
  onSearchSubmit,
  limit,
  onLimitChange,
  onOpenCreate,
  isPending,
  isError,
  error,
  data,
  sortBy,
  sortOrder,
  onSortColumn,
  offset,
  totalPages,
  onPageChange,
  onEmailClick,
}: Props) {
  return (
    <>
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
              onIncludeDeactivatedChange(v === 'all');
            }}
          />
          <TextInput
            placeholder="Search (name, email)"
            size="xs"
            value={searchInput}
            onChange={(e) => onSearchInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearchSubmit()}
          />
          <Button
            size="xs"
            variant="light"
            onClick={() => {
              onSearchSubmit();
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
              onLimitChange(next);
            }}
            style={{ width: 100 }}
          />
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={onOpenCreate}>
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
                <AdminUsersSortableTh
                  label="Name"
                  currentSortBy={sortBy}
                  sortOrder={sortOrder}
                  field="name"
                  onSort={() => onSortColumn('name')}
                />
                <AdminUsersSortableTh
                  label="Email"
                  currentSortBy={sortBy}
                  sortOrder={sortOrder}
                  field="email"
                  onSort={() => onSortColumn('email')}
                />
                <AdminUsersSortableTh
                  label="Role"
                  currentSortBy={sortBy}
                  sortOrder={sortOrder}
                  field="role"
                  onSort={() => onSortColumn('role')}
                />
                <AdminUsersSortableTh
                  label="Teams"
                  currentSortBy={sortBy}
                  sortOrder={sortOrder}
                  field="teams"
                  onSort={() => onSortColumn('teams')}
                />
                <AdminUsersSortableTh
                  label="Departments"
                  currentSortBy={sortBy}
                  sortOrder={sortOrder}
                  field="departments"
                  onSort={() => onSortColumn('departments')}
                />
                <AdminUsersSortableTh
                  label="Status"
                  currentSortBy={sortBy}
                  sortOrder={sortOrder}
                  field="deletedAt"
                  onSort={() => onSortColumn('deletedAt')}
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
                        onClick={() => onEmailClick(u)}
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
              onChange={(p) => onPageChange(p)}
              mt="md"
              size="sm"
            />
          )}
        </>
      )}
    </>
  );
}
