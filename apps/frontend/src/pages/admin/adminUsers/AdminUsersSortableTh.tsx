import { Group, Table } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react';
import type { SortByField, SortOrder } from './adminUsersTypes';

type Props = {
  label: string;
  field: SortByField;
  currentSortBy: SortByField | null;
  sortOrder: SortOrder;
  onSort: () => void;
};

export function AdminUsersSortableTh({ label, field, currentSortBy, sortOrder, onSort }: Props) {
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
