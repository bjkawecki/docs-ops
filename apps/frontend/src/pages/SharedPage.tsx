import { Box, Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useRecentItems } from '../hooks/useRecentItems';
import { PageWithTabs } from '../components/PageWithTabs';
import { RecentItemsCard } from '../components/contexts';

type DocItem = {
  id: string;
  title: string;
  contextId: string;
  createdAt: string;
  updatedAt: string;
};

const SHARED_SCOPE = { type: 'shared' as const };

export function SharedPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const { items: recentItems } = useRecentItems(SHARED_SCOPE);

  const { data: sharedDocsRes, isPending: docsPending } = useQuery({
    queryKey: ['me', 'shared-documents'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/me/shared-documents?limit=50&offset=0');
      if (!res.ok) throw new Error('Failed to load shared documents');
      return (await res.json()) as { items: DocItem[]; total: number };
    },
  });

  const sharedDocs = sharedDocsRes?.items ?? [];
  const docsPreview = sharedDocs.slice(0, 5);

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'documents', label: 'Documents' },
  ];

  const overviewPanel = (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <RecentItemsCard items={recentItems} />
        <Card withBorder padding="md">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              Shared with you
            </Text>
            {docsPreview.length === 0 ? (
              <Text size="sm" c="dimmed">
                No documents shared with you yet.
              </Text>
            ) : (
              <Stack gap={4}>
                {docsPreview.map((d) => (
                  <Link
                    key={d.id}
                    to={`/documents/${d.id}`}
                    style={{ fontSize: 'var(--mantine-font-size-sm)' }}
                  >
                    {d.title || d.id}
                  </Link>
                ))}
              </Stack>
            )}
            <Group justify="flex-end" mt="xs">
              <Button variant="subtle" size="xs" onClick={() => setActiveTab('documents')}>
                View more
              </Button>
            </Group>
          </Stack>
        </Card>
      </SimpleGrid>
    </Stack>
  );

  const documentsPanel = (
    <Stack gap="md">
      {docsPending ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            Loading documents…
          </Text>
        </Card>
      ) : sharedDocs.length === 0 ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No documents shared with you yet.
          </Text>
        </Card>
      ) : (
        <Stack gap="xs">
          {sharedDocs.map((d) => (
            <Card key={d.id} withBorder padding="sm" component={Link} to={`/documents/${d.id}`}>
              <Text fw={500} size="sm">
                {d.title || d.id}
              </Text>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );

  return (
    <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <PageWithTabs
        title="Shared"
        description="Contexts and documents shared with you."
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {[overviewPanel, documentsPanel]}
      </PageWithTabs>
    </Box>
  );
}
