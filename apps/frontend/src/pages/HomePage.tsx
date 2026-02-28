import { Group, Button, Card } from '@mantine/core';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export function HomePage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of internal documentation. Quick links:"
      />
      <Card withBorder padding="md">
        <Group gap="sm">
          <Button component={Link} to="/teams" variant="light" size="sm">
            Teams
          </Button>
          <Button component={Link} to="/repositories" variant="light" size="sm">
            Repositories
          </Button>
          <Button component={Link} to="/processes" variant="light" size="sm">
            Processes
          </Button>
          <Button component={Link} to="/company" variant="light" size="sm">
            Company
          </Button>
          <Button component={Link} to="/templates" variant="light" size="sm">
            Templates
          </Button>
        </Group>
      </Card>
    </>
  );
}
