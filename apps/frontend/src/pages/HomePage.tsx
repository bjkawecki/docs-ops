import { Group, Title, Anchor, Button } from '@mantine/core';
import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <>
      <Title order={2} mb="md">
        Dashboard
      </Title>
      <p>Überblick über die interne Dokumentation. Quick-Links:</p>
      <Group mt="md" gap="sm">
        <Button component={Link} to="/teams" variant="light" size="sm">
          Teams
        </Button>
        <Button component={Link} to="/repositories" variant="light" size="sm">
          Repositories
        </Button>
        <Button component={Link} to="/prozesse" variant="light" size="sm">
          Prozesse
        </Button>
        <Anchor component={Link} to="/firma" size="sm">
          Firma
        </Anchor>
        <Anchor component={Link} to="/templates" size="sm">
          Templates
        </Anchor>
      </Group>
    </>
  );
}
