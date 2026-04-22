import { Link } from 'react-router-dom';
import { NavLink, Stack, Text } from '@mantine/core';
import { IconBuildingSkyscraper, IconSitemap, IconUsersGroup } from '@tabler/icons-react';
import { isActive } from './appShellNavUtils.js';
import { AppShellNavCollapsibleSection } from './AppShellNavCollapsibleSection';
import { AppShellScopeNavLink } from './AppShellScopeNavLink';

type TeamItem = { id: string; name: string };

type Props = {
  pathname: string;
  navLinkStyles: { root: Record<string, unknown> };
  departmentId: string;
  teams: TeamItem[];
  companyCount: number | undefined;
  departmentCounts: Record<string, number>;
  teamCounts: Record<string, number>;
  isTeamsExpanded: boolean;
  toggleTeamsExpanded: () => void;
};

export function AppShellNavDepartmentLeadTeams({
  pathname,
  navLinkStyles,
  departmentId,
  teams,
  companyCount,
  departmentCounts,
  teamCounts,
  isTeamsExpanded,
  toggleTeamsExpanded,
}: Props) {
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
      <AppShellScopeNavLink
        to={`/department/${departmentId}`}
        label="Department"
        active={isActive(`/department/${departmentId}`, pathname)}
        leftSection={<IconSitemap size={18} />}
        navLinkStyles={navLinkStyles}
        badgeCount={departmentCounts[departmentId]}
      />
      <AppShellNavCollapsibleSection
        label="Teams"
        icon={<IconUsersGroup size={18} style={{ flexShrink: 0 }} />}
        expanded={isTeamsExpanded}
        onToggle={toggleTeamsExpanded}
      >
        <Stack gap={0} pl={0}>
          {teams.map((team) => (
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
              style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              styles={navLinkStyles}
            />
          ))}
        </Stack>
      </AppShellNavCollapsibleSection>
    </>
  );
}
