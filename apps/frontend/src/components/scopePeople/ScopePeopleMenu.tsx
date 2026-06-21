import {
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Indicator,
  Popover,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import { IconUsers } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import type { ScopePersonRow } from '../../api/scopePeople-types';
import { useCompanyPeople, useDepartmentPeople, useTeamPeople } from '../../hooks/useScopePeople';
import { formatPresence, initialsFromName } from '../../lib/formatPresence';

export type ScopePeopleScope = 'team' | 'department' | 'company';

type ScopePeopleMenuProps = {
  scope: ScopePeopleScope;
  scopeId: string;
  opened?: boolean;
  onChange?: (opened: boolean) => void;
};

function PersonLine({ person }: { person: ScopePersonRow }) {
  const presence = formatPresence(person.isOnline, person.lastActiveAt);
  const roleLabel =
    person.roles?.includes('lead') && person.roles.includes('member')
      ? 'Lead, Member'
      : person.roles?.includes('lead')
        ? 'Lead'
        : person.roles?.includes('member')
          ? 'Member'
          : null;

  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <Indicator color="green" size={10} offset={4} disabled={!person.isOnline} processing>
        <Avatar size="sm" radius="xl" color="var(--mantine-primary-color-filled)">
          {initialsFromName(person.name)}
        </Avatar>
      </Indicator>
      <Box style={{ minWidth: 0, flex: 1 }}>
        <Text size="sm" fw={500} lineClamp={1}>
          {person.name}
        </Text>
        <Text size="xs" c="dimmed">
          {roleLabel != null ? `${roleLabel} · ${presence}` : presence}
        </Text>
      </Box>
    </Group>
  );
}

function badgeLabel(summary: string): string {
  return summary;
}

export function ScopePeopleMenu({
  scope,
  scopeId,
  opened: controlledOpened,
  onChange,
}: ScopePeopleMenuProps) {
  const [internalOpened, setInternalOpened] = useState(false);
  const opened = controlledOpened ?? internalOpened;
  const setOpened = onChange ?? setInternalOpened;

  const teamQuery = useTeamPeople(scopeId, scope === 'team');
  const deptQuery = useDepartmentPeople(scopeId, scope === 'department');
  const companyQuery = useCompanyPeople(scopeId, scope === 'company');

  const activeQuery =
    scope === 'team' ? teamQuery : scope === 'department' ? deptQuery : companyQuery;

  useEffect(() => {
    if (opened) void activeQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when menu opens
  }, [opened, scope, scopeId]);

  const buttonLabel = scope === 'company' ? 'Organization' : 'People';

  const summaryText = useMemo(() => {
    if (scope === 'team' && teamQuery.data) {
      return `${teamQuery.data.total} · ${teamQuery.data.onlineCount} online`;
    }
    if (scope === 'department' && deptQuery.data) {
      const { peopleCount, onlineCount } = deptQuery.data.summary;
      return `${peopleCount} · ${onlineCount} online`;
    }
    if (scope === 'company' && companyQuery.data) {
      const { departmentCount, peopleCount, onlineCount } = companyQuery.data.summary;
      return `${departmentCount} depts · ${peopleCount} people · ${onlineCount} active`;
    }
    return null;
  }, [scope, teamQuery.data, deptQuery.data, companyQuery.data]);

  const dropdown = (
    <ScrollArea.Autosize mah={420} type="auto">
      <Stack gap="sm" p="xs" miw={280}>
        {activeQuery.isPending && (
          <Text size="sm" c="dimmed">
            Loading…
          </Text>
        )}
        {activeQuery.isError && (
          <Text size="sm" c="red">
            Failed to load people.
          </Text>
        )}
        {scope === 'team' && teamQuery.data && (
          <>
            {teamQuery.data.items.length === 0 ? (
              <Text size="sm" c="dimmed">
                No members yet.
              </Text>
            ) : (
              teamQuery.data.items.map((person) => <PersonLine key={person.id} person={person} />)
            )}
          </>
        )}
        {scope === 'department' && deptQuery.data && (
          <>
            {deptQuery.data.departmentLeads.length > 0 && (
              <>
                <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
                  Department leads
                </Text>
                {deptQuery.data.departmentLeads.map((person) => (
                  <PersonLine key={person.id} person={person} />
                ))}
                <Divider />
              </>
            )}
            {deptQuery.data.teams.map((team) => (
              <Box key={team.id}>
                <Text size="sm" fw={600} mb={4}>
                  {team.name}
                </Text>
                <Stack gap="xs" pl="xs">
                  {team.teamLeads.map((person) => (
                    <PersonLine key={`lead-${person.id}`} person={person} />
                  ))}
                  {team.members.map((person) => (
                    <PersonLine key={`member-${person.id}`} person={person} />
                  ))}
                  {team.teamLeads.length === 0 && team.members.length === 0 && (
                    <Text size="xs" c="dimmed">
                      No members.
                    </Text>
                  )}
                </Stack>
              </Box>
            ))}
          </>
        )}
        {scope === 'company' && companyQuery.data && (
          <>
            {companyQuery.data.companyLeads.length > 0 && (
              <>
                <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
                  Company leads
                </Text>
                {companyQuery.data.companyLeads.map((person) => (
                  <PersonLine key={person.id} person={person} />
                ))}
                <Divider />
              </>
            )}
            {companyQuery.data.departments.map((dept) => (
              <Box key={dept.id}>
                <Text size="sm" fw={600}>
                  {dept.name}
                </Text>
                <Text size="xs" c="dimmed" mb={4}>
                  {dept.teamCount} teams · {dept.peopleCount} people · {dept.onlineCount} active
                </Text>
                {dept.departmentLeads.length > 0 && (
                  <Stack gap="xs" pl="xs" mb="xs">
                    {dept.departmentLeads.map((person) => (
                      <PersonLine key={person.id} person={person} />
                    ))}
                  </Stack>
                )}
                <Stack gap={4} pl="xs">
                  {dept.teams.map((team) => (
                    <Text key={team.id} size="xs" c="dimmed">
                      {team.name} · {team.peopleCount} people · {team.onlineCount} active
                    </Text>
                  ))}
                </Stack>
              </Box>
            ))}
          </>
        )}
      </Stack>
    </ScrollArea.Autosize>
  );

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <Button
          variant="default"
          size="sm"
          leftSection={<IconUsers size={16} />}
          rightSection={
            summaryText != null ? (
              <Badge variant="light" size="sm">
                {badgeLabel(summaryText)}
              </Badge>
            ) : undefined
          }
          onClick={() => setOpened(!opened)}
        >
          {buttonLabel}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p={0}>{dropdown}</Popover.Dropdown>
    </Popover>
  );
}
