import { Link } from 'react-router-dom';
import { Box, Collapse, Group, NavLink, Stack, Text, UnstyledButton } from '@mantine/core';
import {
  IconBuildingSkyscraper,
  IconChevronDown,
  IconChevronRight,
  IconSitemap,
  IconUsersGroup,
} from '@tabler/icons-react';
import { isActive } from './appShellNavUtils.js';
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
            onClick={toggleTeamsExpanded}
          >
            <IconUsersGroup size={18} style={{ flexShrink: 0 }} />
            <Text size="sm" truncate>
              Teams
            </Text>
          </UnstyledButton>
          <UnstyledButton
            style={{ flex: 0, padding: '2px 4px' }}
            onClick={toggleTeamsExpanded}
            aria-expanded={isTeamsExpanded}
          >
            {isTeamsExpanded ? (
              <IconChevronDown size={16} style={{ display: 'block' }} />
            ) : (
              <IconChevronRight size={16} style={{ display: 'block' }} />
            )}
          </UnstyledButton>
        </Group>
      </Box>
      <Collapse in={isTeamsExpanded}>
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
        </Box>
      </Collapse>
    </>
  );
}
