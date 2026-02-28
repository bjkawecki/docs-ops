import { Stack, Text, Button } from '@mantine/core';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          The page you are looking for does not exist.
        </Text>
        <Button component={Link} to="/" variant="light" size="sm">
          Back to Home
        </Button>
      </Stack>
    </>
  );
}
