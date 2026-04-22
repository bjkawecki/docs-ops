import { Alert, Box, Button, Group, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export function ReviewsPage() {
  return (
    <Box>
      <PageHeader
        title="Reviews"
        description="Legacy markdown draft requests are removed. Review flows run through draft suggestions."
      />
      <Stack gap="md">
        <Alert variant="light" color="blue" title="No longer available">
          <Text size="sm" mb="sm">
            There are no open draft requests anymore. Coordinate changes on published documents via
            suggestions on each document page.
          </Text>
          <Group gap="xs">
            <Button component={Link} to="/catalog" size="sm" variant="light">
              Open catalog
            </Button>
            <Button component={Link} to="/" size="sm" variant="subtle">
              Dashboard
            </Button>
          </Group>
        </Alert>
      </Stack>
    </Box>
  );
}
