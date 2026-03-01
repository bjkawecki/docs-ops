import { Link, Outlet, useLocation } from 'react-router-dom';
import { Tabs, Text, Title } from '@mantine/core';

const adminTabs = [
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/teams', label: 'Teams' },
  { to: '/admin/organisation', label: 'Organisation' },
] as const;

export function AdminPage() {
  const location = useLocation();
  const activeTab =
    adminTabs.find((t) => location.pathname === t.to || location.pathname.startsWith(t.to + '/'))
      ?.to ?? '/admin/users';

  return (
    <>
      <Title order={2} mb={4}>
        Admin
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        Manage users, teams and assignments, and edit the organisation (company, department, team).
      </Text>
      <Tabs value={activeTab}>
        <Tabs.List mb="md">
          {adminTabs.map((t) => (
            <Tabs.Tab key={t.to} value={t.to} component={Link} to={t.to}>
              {t.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Outlet />
      </Tabs>
    </>
  );
}
