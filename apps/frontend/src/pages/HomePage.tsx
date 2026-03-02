import { Group, Button, Card } from '@mantine/core';
import { Link } from 'react-router-dom';
import { PageWithTabs } from '../components/PageWithTabs';

export function HomePage() {
  return (
    <PageWithTabs title="Dashboard" description="Overview of internal documentation. Quick links:">
      <Card withBorder padding="md">
        <Group gap="sm">
          <Button component={Link} to="/teams" variant="light" size="sm">
            Teams
          </Button>
          <Button component={Link} to="/catalog" variant="light" size="sm">
            Catalog
          </Button>
          <Button component={Link} to="/company" variant="light" size="sm">
            Company
          </Button>
          <Button component={Link} to="/personal" variant="light" size="sm">
            Personal
          </Button>
          <Button component={Link} to="/shared" variant="light" size="sm">
            Shared
          </Button>
        </Group>
      </Card>
    </PageWithTabs>
  );
}
