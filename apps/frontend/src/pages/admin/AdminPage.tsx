import { Link, Outlet, useLocation } from 'react-router-dom';
import { Tabs, Text, Title } from '@mantine/core';
import './AdminPage.css';

const adminTabs = [
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/teams', label: 'Teams' },
  { to: '/admin/departments', label: 'Departments' },
  { to: '/admin/company', label: 'Company' },
  { to: '/admin/jobs', label: 'Jobs' },
  { to: '/admin/scheduler', label: 'Scheduler' },
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
        Manage users, teams, departments, and company.
      </Text>
      <Tabs value={activeTab}>
        <Tabs.List mb="md">
          {adminTabs.map((t) => (
            <Tabs.Tab key={t.to} value={t.to} renderRoot={(props) => <Link to={t.to} {...props} />}>
              {t.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Outlet />
      </Tabs>
    </>
  );
}
