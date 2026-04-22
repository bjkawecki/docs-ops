import { Button, Group, Stack, Switch, TextInput } from '@mantine/core';
import { useState } from 'react';
import type { UserRow } from './adminUsersTypes';

type Props = {
  user: UserRow;
  onSave: (body: {
    name: string;
    email: string | null;
    isAdmin: boolean;
    isCompanyLead: boolean;
    deletedAt: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
  isLastActiveAdmin?: boolean;
};

export function AdminUserProfileForm({
  user,
  onSave,
  onCancel,
  isPending,
  isLastActiveAdmin,
}: Props) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? '');
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);
  const [isCompanyLead, setIsCompanyLead] = useState(user.role === 'Company Lead');
  const [deactivated, setDeactivated] = useState(!!user.deletedAt);

  const handleSubmit = () => {
    onSave({
      name: name.trim(),
      email: email.trim() || null,
      isAdmin,
      isCompanyLead,
      deletedAt: deactivated ? new Date().toISOString() : null,
    }).catch(() => {});
  };

  return (
    <Stack gap="sm">
      <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextInput
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Switch
        label="Administrator"
        description={
          isLastActiveAdmin ? 'At least one active administrator is required.' : undefined
        }
        checked={isAdmin}
        onChange={(e) => setIsAdmin(e.currentTarget.checked)}
        disabled={isLastActiveAdmin}
      />
      <Switch
        label="Company lead"
        checked={isCompanyLead}
        onChange={(e) => setIsCompanyLead(e.currentTarget.checked)}
      />
      <Switch
        label="Deactivated"
        description={
          isLastActiveAdmin ? 'The last administrator cannot be deactivated.' : undefined
        }
        checked={deactivated}
        onChange={(e) => setDeactivated(e.currentTarget.checked)}
        disabled={isLastActiveAdmin}
      />
      <Group gap="xs" mt="xs">
        <Button size="sm" variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} loading={isPending} disabled={!name.trim()}>
          Save
        </Button>
      </Group>
    </Stack>
  );
}
