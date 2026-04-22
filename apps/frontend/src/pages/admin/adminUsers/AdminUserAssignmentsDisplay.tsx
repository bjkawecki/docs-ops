import { Group, Stack, Text } from '@mantine/core';
import type { UserRow } from './adminUsersTypes';

export function AdminUserAssignmentsDisplay({ user }: { user: UserRow }) {
  const team = user.teams?.[0];
  const deptLead = user.departmentsAsLead?.[0];
  const departmentName = deptLead?.name ?? team?.departmentName ?? '–';
  const departmentRole = deptLead ? 'Lead' : team ? 'Member' : '–';

  const teamRole = team ? (team.isLead ? 'Lead' : 'Member') : '–';

  return (
    <Stack gap="xs">
      <Group justify="flex-start" wrap="nowrap" gap="xl" align="flex-start">
        <div style={{ minWidth: 140 }}>
          <Text size="xs" c="dimmed">
            Department
          </Text>
          <Text size="sm">{departmentName}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            Role
          </Text>
          <Text size="sm">{departmentRole}</Text>
        </div>
      </Group>
      <Group justify="flex-start" wrap="nowrap" gap="xl" align="flex-start">
        <div style={{ minWidth: 140 }}>
          <Text size="xs" c="dimmed">
            Team
          </Text>
          <Text size="sm">{team?.name ?? '–'}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            Role
          </Text>
          <Text size="sm">{teamRole}</Text>
        </div>
      </Group>
    </Stack>
  );
}
