import { Button, Group, Select, Stack, TextInput } from '@mantine/core';
import { useState } from 'react';
import type { Company } from 'backend/api-types';

export type CreateDepartmentFormProps = {
  companies: Company[];
  onSubmit: (name: string, companyId: string) => void;
  onCancel: () => void;
  loading: boolean;
};

export function CreateDepartmentForm({
  companies,
  onSubmit,
  onCancel,
  loading,
}: CreateDepartmentFormProps) {
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const options = companies.map((c) => ({ value: c.id, label: c.name }));
  return (
    <Stack>
      <TextInput
        label="Name"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        required
      />
      <Select
        label="Company"
        placeholder="Select company"
        data={options}
        value={companyId}
        onChange={setCompanyId}
        required
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => companyId && onSubmit(name, companyId)}
          loading={loading}
          disabled={!name.trim() || !companyId}
        >
          Create
        </Button>
      </Group>
    </Stack>
  );
}
