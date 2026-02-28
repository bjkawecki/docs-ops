import { Group, Title, Anchor, Button } from '@mantine/core';
import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <>
      <Title order={2} mb="md">
        Dashboard
      </Title>
      <p>Overview of internal documentation. Quick links:</p>
      <Group mt="md" gap="sm">
        <Button component={Link} to="/teams" variant="light" size="sm">
          Teams
        </Button>
        <Button component={Link} to="/repositories" variant="light" size="sm">
          Repositories
        </Button>
        <Button component={Link} to="/processes" variant="light" size="sm">
          Processes
        </Button>
        <Anchor component={Link} to="/company" size="sm">
          Company
        </Anchor>
        <Anchor component={Link} to="/templates" size="sm">
          Templates
        </Anchor>
      </Group>
    </>
  );
}
