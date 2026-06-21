import { Avatar, Button, Group, Stack, Text } from '@mantine/core';
import { IconUsers } from '@tabler/icons-react';
import { useMemo } from 'react';
import type { ScopePersonRow } from '../../api/scopePeople-types';
import { useCompanyPeople, useDepartmentPeople, useTeamPeople } from '../../hooks/useScopePeople';
import { initialsFromName } from '../../lib/formatPresence';
import type { ScopePeopleScope } from './ScopePeopleMenu';

type Props = {
  scope: ScopePeopleScope;
  scopeId: string;
  onViewAll: () => void;
};

function AvatarStack({ people }: { people: ScopePersonRow[] }) {
  const preview = people.slice(0, 5);
  if (preview.length === 0) return null;
  return (
    <Group gap={4}>
      {preview.map((person) => (
        <Avatar
          key={person.id}
          size="sm"
          radius="xl"
          color="var(--mantine-primary-color-filled)"
          title={person.name}
        >
          {initialsFromName(person.name)}
        </Avatar>
      ))}
    </Group>
  );
}

export function ScopePeopleSummaryCard({ scope, scopeId, onViewAll }: Props) {
  const teamQuery = useTeamPeople(scopeId, scope === 'team');
  const deptQuery = useDepartmentPeople(scopeId, scope === 'department');
  const companyQuery = useCompanyPeople(scopeId, scope === 'company');

  const summaryLine = useMemo(() => {
    if (scope === 'team' && teamQuery.data) {
      return `${teamQuery.data.total} people · ${teamQuery.data.onlineCount} online`;
    }
    if (scope === 'department' && deptQuery.data) {
      const { peopleCount, onlineCount, teamCount } = deptQuery.data.summary;
      return `${peopleCount} people · ${onlineCount} online · ${teamCount} teams`;
    }
    if (scope === 'company' && companyQuery.data) {
      const { departmentCount, peopleCount, onlineCount } = companyQuery.data.summary;
      return `${departmentCount} departments · ${peopleCount} people · ${onlineCount} active`;
    }
    return null;
  }, [scope, teamQuery.data, deptQuery.data, companyQuery.data]);

  const avatarPeople = useMemo(() => {
    if (scope === 'team' && teamQuery.data) return teamQuery.data.items;
    if (scope === 'department' && deptQuery.data) {
      const seen = new Set<string>();
      const people: ScopePersonRow[] = [];
      for (const team of deptQuery.data.teams) {
        for (const person of [...team.teamLeads, ...team.members]) {
          if (!seen.has(person.id)) {
            seen.add(person.id);
            people.push(person);
          }
        }
      }
      return people;
    }
    return [];
  }, [scope, teamQuery.data, deptQuery.data]);

  const title = scope === 'company' ? 'Organization' : 'People';

  return (
    <Stack
      gap="sm"
      p="md"
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 'var(--mantine-radius-md)',
      }}
    >
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <IconUsers size={18} aria-hidden />
          <Text fw={600}>{title}</Text>
        </Group>
        <Button variant="subtle" size="xs" onClick={onViewAll}>
          View all
        </Button>
      </Group>
      {summaryLine != null ? (
        <Text size="sm" c="dimmed">
          {summaryLine}
        </Text>
      ) : (
        <Text size="sm" c="dimmed">
          Loading…
        </Text>
      )}
      {scope !== 'company' && avatarPeople.length > 0 && <AvatarStack people={avatarPeople} />}
    </Stack>
  );
}
