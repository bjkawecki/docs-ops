import { Button, Group, Select, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '../../../api/client';
import type { DepartmentWithTeams, UserRow } from './adminUsersTypes';

type Props = {
  user: UserRow;
  departments: DepartmentWithTeams[];
  onSave: () => void;
  onCancel: () => void;
};

export function AdminUserAssignmentsForm({ user, departments, onSave, onCancel }: Props) {
  const allTeams = departments.flatMap((d) =>
    (d.teams ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      departmentId: d.id,
      departmentName: d.name,
    }))
  );
  const currentTeam = user.teams?.[0];
  const currentDeptLead = user.departmentsAsLead?.[0];

  const [teamId, setTeamId] = useState(currentTeam?.id ?? '');
  const [teamRole, setTeamRole] = useState<'Member' | 'Lead'>(
    currentTeam?.isLead ? 'Lead' : 'Member'
  );
  const [departmentLeadId, setDepartmentLeadId] = useState(currentDeptLead?.id ?? '');

  const removeFromTeam = useMutation({
    mutationFn: async (tid: string) => {
      const res = await apiFetch(`/api/v1/teams/${tid}/members/${user.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const addToTeam = useMutation({
    mutationFn: async (tid: string) => {
      const res = await apiFetch(`/api/v1/teams/${tid}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const addTeamLead = useMutation({
    mutationFn: async (tid: string) => {
      const res = await apiFetch(`/api/v1/teams/${tid}/team-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const removeTeamLead = useMutation({
    mutationFn: async (tid: string) => {
      const res = await apiFetch(`/api/v1/teams/${tid}/team-leads/${user.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const addDepartmentLead = useMutation({
    mutationFn: async (departmentId: string) => {
      const res = await apiFetch(`/api/v1/departments/${departmentId}/department-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const removeDepartmentLead = useMutation({
    mutationFn: async (departmentId: string) => {
      const res = await apiFetch(
        `/api/v1/departments/${departmentId}/department-leads/${user.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const isPendingMut =
    removeFromTeam.isPending ||
    addToTeam.isPending ||
    addTeamLead.isPending ||
    removeTeamLead.isPending ||
    addDepartmentLead.isPending ||
    removeDepartmentLead.isPending;

  const handleSave = async () => {
    try {
      for (const t of user.teams ?? []) {
        if (t.id !== teamId) await removeFromTeam.mutateAsync(t.id);
      }
      if (teamId && !user.teams?.some((t) => t.id === teamId)) {
        await addToTeam.mutateAsync(teamId);
      }
      if (teamId) {
        const wantLead = teamRole === 'Lead';
        const current = user.teams?.find((t) => t.id === teamId)?.isLead ?? false;
        if (wantLead && !current) await addTeamLead.mutateAsync(teamId);
        if (!wantLead && current) await removeTeamLead.mutateAsync(teamId);
      }
      for (const d of user.departmentsAsLead ?? []) {
        if (d.id !== departmentLeadId) await removeDepartmentLead.mutateAsync(d.id);
      }
      if (departmentLeadId && !user.departmentsAsLead?.some((d) => d.id === departmentLeadId)) {
        await addDepartmentLead.mutateAsync(departmentLeadId);
      }
      notifications.show({
        title: 'Assignments updated',
        message: 'Team and department assignments were saved.',
        color: 'green',
      });
      onSave();
    } catch {
      // errors already shown
    }
  };

  const teamOptions = allTeams.map((t) => ({
    value: t.id,
    label: `${t.name} (${t.departmentName})`,
  }));

  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.name }));

  return (
    <Stack gap="sm">
      <Select
        label="Team"
        placeholder="Select team"
        data={teamOptions}
        value={teamId || null}
        onChange={(v) => setTeamId(v ?? '')}
        clearable
        size="sm"
      />
      <Select
        label="Team role"
        data={[
          { value: 'Member', label: 'Member' },
          { value: 'Lead', label: 'Lead' },
        ]}
        value={teamRole}
        onChange={(v) => v && setTeamRole(v as 'Member' | 'Lead')}
        size="sm"
      />
      <Select
        label="Department (lead)"
        placeholder="None"
        description="Department where this user is department lead (optional)"
        data={departmentOptions}
        value={departmentLeadId || null}
        onChange={(v) => setDepartmentLeadId(v ?? '')}
        clearable
        size="sm"
      />
      <Group gap="xs" mt="xs">
        <Button size="sm" variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => void handleSave()}
          loading={isPendingMut}
          disabled={!teamId}
        >
          Save
        </Button>
      </Group>
    </Stack>
  );
}
