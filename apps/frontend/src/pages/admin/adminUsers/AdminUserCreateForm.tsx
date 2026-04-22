import { Button, Group, Select, Stack, Switch, TextInput } from '@mantine/core';
import { useState } from 'react';
import type { CreateUserPayload, DepartmentWithTeams } from './adminUsersTypes';

type Props = {
  departments: DepartmentWithTeams[];
  onSubmit: (body: CreateUserPayload) => void;
  onCancel: () => void;
  isPending: boolean;
};

export function AdminUserCreateForm({ departments, onSubmit, onCancel, isPending }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamRole, setTeamRole] = useState<'member' | 'leader'>('member');
  const [supervisorOfDepartment, setSupervisorOfDepartment] = useState(false);

  const selectedDepartment = departmentId ? departments.find((d) => d.id === departmentId) : null;
  const teamOptions = (selectedDepartment?.teams ?? []).map((t) => ({
    value: t.id,
    label: t.name,
  }));
  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.name }));

  const handleSubmit = () => {
    onSubmit({
      name,
      email,
      password,
      isAdmin,
      departmentId: departmentId || undefined,
      teamId: teamId || undefined,
      teamRole: teamId ? teamRole : undefined,
      supervisorOfDepartment: departmentId ? supervisorOfDepartment : false,
    });
  };

  return (
    <Stack>
      <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <TextInput
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <TextInput
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
      />
      <Switch
        label="Administrator"
        checked={isAdmin}
        onChange={(e) => setIsAdmin(e.currentTarget.checked)}
      />
      <Select
        label="Department"
        placeholder="Optional"
        data={departmentOptions}
        value={departmentId}
        onChange={(v) => {
          setDepartmentId(v);
          setTeamId(null);
        }}
        clearable
      />
      <Select
        label="Team"
        placeholder={departmentId ? 'Optional' : 'Select department first'}
        data={teamOptions}
        value={teamId}
        onChange={setTeamId}
        disabled={!departmentId}
        clearable
      />
      {teamId && (
        <Select
          label="Role in team"
          data={[
            { value: 'member', label: 'Member' },
            { value: 'leader', label: 'Team Lead' },
          ]}
          value={teamRole}
          onChange={(v) => v && setTeamRole(v as 'member' | 'leader')}
        />
      )}
      {departmentId && (
        <Switch
          label="Department Lead of this department"
          checked={supervisorOfDepartment}
          onChange={(e) => setSupervisorOfDepartment(e.currentTarget.checked)}
        />
      )}
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          loading={isPending}
          disabled={!name.trim() || !email.trim() || password.length < 8}
        >
          Create
        </Button>
      </Group>
    </Stack>
  );
}
