import { Button, Group, Select, Stack, TextInput } from '@mantine/core';
import { useState } from 'react';
import type { Department, Team } from 'backend/api-types';

export type CreateTeamFormProps = {
  departments: (Department & { teams?: Team[] })[];
  onSubmit: (name: string, departmentId: string) => void;
  onCancel: () => void;
  loading: boolean;
};

export function CreateTeamForm({ departments, onSubmit, onCancel, loading }: CreateTeamFormProps) {
  const [name, setName] = useState('');
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.name }));
  return (
    <Stack>
      <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <Select
        label="Department"
        placeholder="Select department"
        data={departmentOptions}
        value={departmentId}
        onChange={(v) => setDepartmentId(v)}
        required
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => departmentId && onSubmit(name, departmentId)}
          loading={loading}
          disabled={!name.trim() || !departmentId}
        >
          Create
        </Button>
      </Group>
    </Stack>
  );
}
