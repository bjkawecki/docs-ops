import { Link } from 'react-router-dom';
import { Box, Collapse, Group, NavLink, Stack, Text, UnstyledButton } from '@mantine/core';
import {
  IconBuildingSkyscraper,
  IconChevronDown,
  IconChevronRight,
  IconSitemap,
  IconUsersGroup,
} from '@tabler/icons-react';
import type { DepartmentWithTeams } from './appShellNavUtils.js';
import { isActive } from './appShellNavUtils.js';
import { AppShellScopeNavLink } from './AppShellScopeNavLink';

type Props = {
  pathname: string;
  navLinkStyles: { root: Record<string, unknown> };
  depts: DepartmentWithTeams[];
  companyCount: number | undefined;
  departmentCounts: Record<string, number>;
  teamCounts: Record<string, number>;
  departmentsSectionExpanded: boolean;
  setDepartmentsSectionExpanded: (v: boolean | ((p: boolean) => boolean)) => void;
  teamsSectionExpanded: boolean;
  setTeamsSectionExpanded: (v: boolean | ((p: boolean) => boolean)) => void;
};

export function AppShellNavCompanyDepartments({
  pathname,
  navLinkStyles,
  depts,
  companyCount,
  departmentCounts,
  teamCounts,
  departmentsSectionExpanded,
  setDepartmentsSectionExpanded,
  teamsSectionExpanded,
  setTeamsSectionExpanded,
}: Props) {
  const singleDeptDocumentCount =
    depts.length === 1 && typeof departmentCounts[depts[0].id] === 'number'
      ? departmentCounts[depts[0].id]
      : undefined;

  return (
    <>
      <AppShellScopeNavLink
        to="/company"
        label="Company"
        active={isActive('/company', pathname)}
        leftSection={<IconBuildingSkyscraper size={18} />}
        navLinkStyles={navLinkStyles}
        badgeCount={companyCount}
      />
      <Box
        data-sidebar-parent
        style={{
          borderRadius: 'var(--mantine-radius-sm)',
          display: 'flex',
          flex: 1,
          minWidth: 0,
          minHeight: 'var(--mantine-nav-link-height, 44px)',
        }}
      >
        <Group gap={0} wrap="nowrap" style={{ alignItems: 'stretch', flex: 1, minHeight: '100%' }}>
          <UnstyledButton
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 'var(--mantine-nav-link-height, 44px)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
            }}
            onClick={() => setDepartmentsSectionExpanded((v) => !v)}
          >
            <IconSitemap size={18} style={{ flexShrink: 0 }} />
            <Text size="sm" truncate>
              Departments
            </Text>
          </UnstyledButton>
          {singleDeptDocumentCount !== undefined && singleDeptDocumentCount > 0 ? (
            <Text size="xs" c="var(--mantine-primary-color-filled)" component="span" px={4}>
              {singleDeptDocumentCount}
            </Text>
          ) : null}
          <UnstyledButton
            style={{ flex: 0, padding: '2px 4px' }}
            onClick={() => setDepartmentsSectionExpanded((v) => !v)}
            aria-expanded={departmentsSectionExpanded}
          >
            {departmentsSectionExpanded ? (
              <IconChevronDown size={16} style={{ display: 'block' }} />
            ) : (
              <IconChevronRight size={16} style={{ display: 'block' }} />
            )}
          </UnstyledButton>
        </Group>
      </Box>
      <Collapse in={departmentsSectionExpanded}>
        <Box
          style={{
            borderLeft: '2px solid var(--mantine-color-gray-7)',
            marginLeft: 20,
            paddingLeft: 8,
            marginTop: 4,
            marginBottom: 4,
          }}
        >
          <Stack gap={0} pl={0}>
            {depts.map((dept) => (
              <NavLink
                key={dept.id}
                data-sidebar-link
                component={Link}
                to={`/department/${dept.id}`}
                label={dept.name}
                active={isActive(`/department/${dept.id}`, pathname)}
                rightSection={
                  departmentCounts[dept.id] !== undefined && departmentCounts[dept.id] > 0 ? (
                    <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                      {departmentCounts[dept.id]}
                    </Text>
                  ) : null
                }
                style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                styles={navLinkStyles}
              />
            ))}
          </Stack>
        </Box>
      </Collapse>
      <Box
        data-sidebar-parent
        style={{
          borderRadius: 'var(--mantine-radius-sm)',
          display: 'flex',
          flex: 1,
          minWidth: 0,
          minHeight: 'var(--mantine-nav-link-height, 44px)',
        }}
      >
        <Group gap={0} wrap="nowrap" style={{ alignItems: 'stretch', flex: 1, minHeight: '100%' }}>
          <UnstyledButton
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 'var(--mantine-nav-link-height, 44px)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
            }}
            onClick={() => setTeamsSectionExpanded((v) => !v)}
          >
            <IconUsersGroup size={18} style={{ flexShrink: 0 }} />
            <Text size="sm" truncate>
              Teams
            </Text>
          </UnstyledButton>
          <UnstyledButton
            style={{ flex: 0, padding: '2px 4px' }}
            onClick={() => setTeamsSectionExpanded((v) => !v)}
            aria-expanded={teamsSectionExpanded}
          >
            {teamsSectionExpanded ? (
              <IconChevronDown size={16} style={{ display: 'block' }} />
            ) : (
              <IconChevronRight size={16} style={{ display: 'block' }} />
            )}
          </UnstyledButton>
        </Group>
      </Box>
      <Collapse in={teamsSectionExpanded}>
        <Box
          style={{
            borderLeft: '2px solid var(--mantine-color-gray-7)',
            marginLeft: 20,
            paddingLeft: 8,
            marginTop: 4,
            marginBottom: 4,
          }}
        >
          <Stack gap={0} pl={0}>
            {depts.map((dept) => (
              <Box key={dept.id}>
                <Text size="xs" fw={500} c="dimmed" mt="xs" mb={4}>
                  {dept.name}
                </Text>
                {(dept.teams ?? []).map((team) => (
                  <NavLink
                    key={team.id}
                    data-sidebar-link
                    component={Link}
                    to={`/team/${team.id}`}
                    label={team.name}
                    active={pathname === `/team/${team.id}`}
                    rightSection={
                      teamCounts[team.id] !== undefined && teamCounts[team.id] > 0 ? (
                        <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                          {teamCounts[team.id]}
                        </Text>
                      ) : null
                    }
                    pl="sm"
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    styles={navLinkStyles}
                  />
                ))}
              </Box>
            ))}
          </Stack>
        </Box>
      </Collapse>
    </>
  );
}
