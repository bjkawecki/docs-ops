import { useState } from 'react';
import { Stack, TextInput, Group, Button } from '@mantine/core';

export function CompanyForm({
  initialName,
  onSubmit,
  onCancel,
  loading,
}: {
  initialName: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initialName);
  return (
    <Stack>
      <TextInput
        label="Name"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        required
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSubmit(name)} loading={loading} disabled={!name.trim()}>
          Save
        </Button>
      </Group>
    </Stack>
  );
}
