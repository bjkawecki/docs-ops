import { Button, Group, Select, Text, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  TEAMS_PAGE_SIZE_KEY,
} from './adminTeamsTabConstants';

export type AdminTeamsToolbarProps = {
  filterText: string;
  onFilterTextChange: (value: string) => void;
  filterDepartmentId: string | null;
  onFilterDepartmentIdChange: (value: string | null) => void;
  departmentOptions: { value: string; label: string }[];
  companyId: string | null;
  filteredTeamsCount: number;
  limit: number;
  onLimitChange: (next: number) => void;
  onOpenCreate: () => void;
  createDisabled: boolean;
};

export function AdminTeamsToolbar({
  filterText,
  onFilterTextChange,
  filterDepartmentId,
  onFilterDepartmentIdChange,
  departmentOptions,
  companyId,
  filteredTeamsCount,
  limit,
  onLimitChange,
  onOpenCreate,
  createDisabled,
}: AdminTeamsToolbarProps) {
  return (
    <Group mb="md" justify="space-between" wrap="wrap" gap="sm">
      <Group gap="sm" wrap="wrap">
        <TextInput
          placeholder="Search (team, department)"
          size="xs"
          value={filterText}
          onChange={(e) => onFilterTextChange(e.currentTarget.value)}
        />
        <Select
          placeholder="Department"
          size="xs"
          data={departmentOptions}
          value={filterDepartmentId ?? ''}
          onChange={(v) => onFilterDepartmentIdChange(v || null)}
          disabled={!companyId}
          clearable
          style={{ width: 160 }}
        />
      </Group>
      <Group gap="sm" align="flex-end">
        <Text size="sm" c="dimmed">
          {filteredTeamsCount} team(s)
        </Text>
        <Select
          label="Per page"
          data={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
          value={String(limit)}
          onChange={(value) => {
            const next = Number(value ?? DEFAULT_PAGE_SIZE);
            onLimitChange(next);
            try {
              window.localStorage.setItem(TEAMS_PAGE_SIZE_KEY, String(next));
            } catch {
              /* ignore */
            }
          }}
          style={{ width: 100 }}
        />
        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={onOpenCreate}
          disabled={createDisabled}
        >
          Create team
        </Button>
      </Group>
    </Group>
  );
}
