import { Alert, Box, Button, Group, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export function ReviewsPage() {
  return (
    <Box>
      <PageHeader
        title="Reviews"
        description="Frühere Markdown-Draft-Requests (PRs) sind entfernt; Inhalte laufen über Lead-Draft und Suggestions."
      />
      <Stack gap="md">
        <Alert variant="light" color="blue" title="Nicht mehr verfügbar">
          <Text size="sm" mb="sm">
            Es gibt keine offenen Draft-Requests mehr. Änderungen an veröffentlichten Dokumenten
            koordinieren Sie über das Block-System (Suggestions) auf der jeweiligen Dokumentseite.
          </Text>
          <Group gap="xs">
            <Button component={Link} to="/catalog" size="sm" variant="light">
              Zum Katalog
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
