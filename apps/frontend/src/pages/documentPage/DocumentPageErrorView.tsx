import { Button, Group, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';

export function DocumentPageErrorView() {
  return (
    <Stack gap="md">
      <Text size="sm" c="red">
        Document not found or access denied.
      </Text>
      <Group gap="xs">
        <Button variant="light" size="sm" component={Link} to="/catalog">
          Back to Catalog
        </Button>
        <Button variant="subtle" size="sm" component={Link} to="/">
          Dashboard
        </Button>
      </Group>
    </Stack>
  );
}
