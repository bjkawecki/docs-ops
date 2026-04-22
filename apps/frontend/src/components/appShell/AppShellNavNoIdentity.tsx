import { IconBuildingSkyscraper, IconSitemap, IconUsersGroup } from '@tabler/icons-react';
import { isActive } from './appShellNavUtils.js';
import { AppShellScopeNavLink } from './AppShellScopeNavLink';

type Props = {
  pathname: string;
  navLinkStyles: { root: Record<string, unknown> };
  companyCount: number | undefined;
};

export function AppShellNavNoIdentity({ pathname, navLinkStyles, companyCount }: Props) {
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
        to="/department"
        label="Department"
        active={isActive('/department', pathname)}
        leftSection={<IconSitemap size={18} />}
        navLinkStyles={navLinkStyles}
      />
      <AppShellScopeNavLink
        to="/team"
        label="Team"
        active={isActive('/team', pathname)}
        leftSection={<IconUsersGroup size={18} />}
        navLinkStyles={navLinkStyles}
      />
    </>
  );
}
