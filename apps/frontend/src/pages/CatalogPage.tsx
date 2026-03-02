import { Card, Text } from '@mantine/core';
import { PageHeader } from '../components/PageHeader';

/**
 * Catalog: all accessible documents as table (filter/sort/search).
 * No tab area per §7. Placeholder until backend GET /api/v1/documents is available.
 */
export function CatalogPage() {
  return (
    <>
      <PageHeader
        title="Catalog"
        description="All documents you can access. Filter, search, and sort. Table view coming soon."
      />
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          Catalog table (documents) will be implemented when backend provides a document list
          endpoint. For now, use Team / Department / Company pages to open contexts.
        </Text>
      </Card>
    </>
  );
}
