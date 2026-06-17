import { IconBuildingSkyscraper, IconSitemap, IconUsersGroup } from '@tabler/icons-react';
import { isActive } from './appShellNavUtils.js';
import { AppShellScopeNavLink } from './AppShellScopeNavLink';

type Props = {
  pathname: string;
  navLinkStyles: { root: Record<string, unknown> };
  userDepartmentId: string | undefined;
  userTeamId: string | undefined;
  companyCount: number | undefined;
  departmentCounts: Record<string, number>;
  teamCounts: Record<string, number>;
  isMiniRail?: boolean;
  onNavigate?: () => void;
};

export function AppShellNavMemberScopeLinks({
  pathname,
  navLinkStyles,
  userDepartmentId,
  userTeamId,
  companyCount,
  departmentCounts,
  teamCounts,
  isMiniRail = false,
  onNavigate,
}: Props) {
  const departmentBadge =
    userDepartmentId !== undefined ? departmentCounts[userDepartmentId] : undefined;
  const teamBadge = userTeamId !== undefined ? teamCounts[userTeamId] : undefined;

  return (
    <>
      <AppShellScopeNavLink
        to="/company"
        label="Company"
        active={isActive('/company', pathname)}
        leftSection={<IconBuildingSkyscraper size={18} />}
        navLinkStyles={navLinkStyles}
        badgeCount={companyCount}
        isMiniRail={isMiniRail}
        onNavigate={onNavigate}
      />
      <AppShellScopeNavLink
        to={userDepartmentId ? `/department/${userDepartmentId}` : '/department'}
        label="Department"
        active={
          userDepartmentId
            ? isActive(`/department/${userDepartmentId}`, pathname)
            : isActive('/department', pathname)
        }
        leftSection={<IconSitemap size={18} />}
        navLinkStyles={navLinkStyles}
        badgeCount={departmentBadge}
        isMiniRail={isMiniRail}
        onNavigate={onNavigate}
      />
      <AppShellScopeNavLink
        to={userTeamId ? `/team/${userTeamId}` : '/team'}
        label="Team"
        active={
          userTeamId ? isActive(`/team/${userTeamId}`, pathname) : isActive('/team', pathname)
        }
        leftSection={<IconUsersGroup size={18} />}
        navLinkStyles={navLinkStyles}
        badgeCount={teamBadge}
        isMiniRail={isMiniRail}
        onNavigate={onNavigate}
      />
    </>
  );
}
