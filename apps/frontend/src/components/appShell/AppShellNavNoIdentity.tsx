import { Link } from 'react-router-dom';
import { NavLink, Text } from '@mantine/core';
import { IconBuildingSkyscraper, IconSitemap, IconUsersGroup } from '@tabler/icons-react';
import { isActive } from './appShellNavUtils.js';

type Props = {
  pathname: string;
  navLinkStyles: { root: Record<string, unknown> };
  companyCount: number | undefined;
};

export function AppShellNavNoIdentity({ pathname, navLinkStyles, companyCount }: Props) {
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
        to="/department"
        label="Department"
        active={isActive('/department', pathname)}
        leftSection={<IconSitemap size={18} />}
        styles={navLinkStyles}
      />
      <NavLink
        data-sidebar-link
        component={Link}
        to="/team"
        label="Team"
        active={isActive('/team', pathname)}
        leftSection={<IconUsersGroup size={18} />}
        styles={navLinkStyles}
      />
    </>
  );
}
