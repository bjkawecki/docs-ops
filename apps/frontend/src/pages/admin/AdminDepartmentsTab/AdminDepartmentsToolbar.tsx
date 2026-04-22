import { Button, Group, Select, Text, TextInput } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import {
  DEFAULT_PAGE_SIZE,
  DEPARTMENTS_PAGE_SIZE_KEY,
  PAGE_SIZE_OPTIONS,
} from './adminDepartmentsTabConstants';

export type AdminDepartmentsToolbarProps = {
  filterText: string;
  onFilterTextChange: (value: string) => void;
  filterCompanyId: string | null;
  onFilterCompanyIdChange: (value: string | null) => void;
  companyOptions: { value: string; label: string }[];
  filteredDepartmentsCount: number;
  limit: number;
  onLimitChange: (next: number) => void;
  onOpenCreate: () => void;
  createDisabled: boolean;
};

export function AdminDepartmentsToolbar({
  filterText,
  onFilterTextChange,
  filterCompanyId,
  onFilterCompanyIdChange,
  companyOptions,
  filteredDepartmentsCount,
  limit,
  onLimitChange,
  onOpenCreate,
  createDisabled,
}: AdminDepartmentsToolbarProps) {
  return (
    <Group mb="md" justify="space-between" wrap="wrap" gap="sm">
      <Group gap="sm" wrap="wrap">
        <TextInput
          placeholder="Search (department, company)"
          size="xs"
          value={filterText}
          onChange={(e) => onFilterTextChange(e.currentTarget.value)}
        />
        <Select
          placeholder="Company"
          size="xs"
          data={companyOptions}
          value={filterCompanyId ?? ''}
          onChange={(v) => onFilterCompanyIdChange(v || null)}
          clearable
          style={{ width: 160 }}
        />
      </Group>
      <Group gap="sm" align="flex-end">
        <Text size="sm" c="dimmed">
          {filteredDepartmentsCount} department(s)
        </Text>
        <Select
          label="Per page"
          data={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
          value={String(limit)}
          onChange={(value) => {
            const next = Number(value ?? DEFAULT_PAGE_SIZE);
            onLimitChange(next);
            try {
              window.localStorage.setItem(DEPARTMENTS_PAGE_SIZE_KEY, String(next));
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
          Create department
        </Button>
      </Group>
    </Group>
  );
}
