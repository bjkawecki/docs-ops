import { Link } from 'react-router-dom';
import { NavLink, Text } from '@mantine/core';
import { IconBuildingSkyscraper, IconSitemap, IconUsersGroup } from '@tabler/icons-react';
import { isActive } from './appShellNavUtils.js';

type Props = {
  pathname: string;
  navLinkStyles: { root: Record<string, unknown> };
  userDepartmentId: string | undefined;
  userTeamId: string | undefined;
  companyCount: number | undefined;
  departmentCounts: Record<string, number>;
  teamCounts: Record<string, number>;
};

export function AppShellNavMemberScopeLinks({
  pathname,
  navLinkStyles,
  userDepartmentId,
  userTeamId,
  companyCount,
  departmentCounts,
  teamCounts,
}: Props) {
  return (
    <>
      <NavLink
        data-sidebar-link
        component={Link}
        to="/company"
        label="Company"
        active={isActive('/company', pathname)}
        leftSection={<IconBuildingSkyscraper size={18} />}
        rightSection={
          companyCount !== undefined && companyCount > 0 ? (
            <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
              {companyCount}
            </Text>
          ) : null
        }
        styles={navLinkStyles}
      />
      <NavLink
        data-sidebar-link
        component={Link}
        to={userDepartmentId ? `/department/${userDepartmentId}` : '/department'}
        label="Department"
        active={
          userDepartmentId
            ? isActive(`/department/${userDepartmentId}`, pathname)
            : isActive('/department', pathname)
        }
        leftSection={<IconSitemap size={18} />}
        rightSection={
          userDepartmentId &&
          departmentCounts[userDepartmentId] !== undefined &&
          departmentCounts[userDepartmentId] > 0 ? (
            <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
              {departmentCounts[userDepartmentId]}
            </Text>
          ) : null
        }
        styles={navLinkStyles}
      />
      <NavLink
        data-sidebar-link
        component={Link}
        to={userTeamId ? `/team/${userTeamId}` : '/team'}
        label="Team"
        active={
          userTeamId ? isActive(`/team/${userTeamId}`, pathname) : isActive('/team', pathname)
        }
        leftSection={<IconUsersGroup size={18} />}
        rightSection={
          userTeamId && teamCounts[userTeamId] !== undefined && teamCounts[userTeamId] > 0 ? (
            <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
              {teamCounts[userTeamId]}
            </Text>
          ) : null
        }
        styles={navLinkStyles}
      />
    </>
  );
}
