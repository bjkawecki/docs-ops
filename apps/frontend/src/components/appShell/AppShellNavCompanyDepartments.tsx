import { Link } from 'react-router-dom';
import { Box, NavLink, Stack, Text } from '@mantine/core';
import { IconBuildingSkyscraper, IconSitemap, IconUsersGroup } from '@tabler/icons-react';
import type { DepartmentWithTeams } from './appShellNavUtils.js';
import { isActive } from './appShellNavUtils.js';
import { AppShellNavCollapsibleSection } from './AppShellNavCollapsibleSection';
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
      <AppShellNavCollapsibleSection
        label="Departments"
        icon={<IconSitemap size={18} style={{ flexShrink: 0 }} />}
        expanded={departmentsSectionExpanded}
        onToggle={() => setDepartmentsSectionExpanded((v) => !v)}
        middleSection={
          singleDeptDocumentCount !== undefined && singleDeptDocumentCount > 0 ? (
            <Text size="xs" c="var(--mantine-primary-color-filled)" component="span" px={4}>
              {singleDeptDocumentCount}
            </Text>
          ) : null
        }
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
      </AppShellNavCollapsibleSection>
      <AppShellNavCollapsibleSection
        label="Teams"
        icon={<IconUsersGroup size={18} style={{ flexShrink: 0 }} />}
        expanded={teamsSectionExpanded}
        onToggle={() => setTeamsSectionExpanded((v) => !v)}
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
      </AppShellNavCollapsibleSection>
    </>
  );
}
