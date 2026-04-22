import { Group, Table } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconSelector } from '@tabler/icons-react';

export interface SortableTableThProps {
  label: string;
  column: string;
  sortBy: string;
  sortOrder: string;
  onClick: () => void;
}

/** Table header for a sortable column: label + icon (selector when unsorted, arrow when sorted). */
export function SortableTableTh({
  label,
  column,
  sortBy,
  sortOrder,
  onClick,
}: SortableTableThProps) {
  const Icon = sortBy !== column ? IconSelector : sortOrder === 'asc' ? IconArrowUp : IconArrowDown;
  return (
    <Table.Th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={onClick}>
      <Group gap={4} wrap="nowrap">
        {label}
        <Icon size={14} style={sortBy !== column ? { opacity: 0.5 } : undefined} />
      </Group>
    </Table.Th>
  );
}
