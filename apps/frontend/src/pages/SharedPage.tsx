import { Box, Card, SimpleGrid, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { DraftsCard } from '../components/DraftsCard';
import { ViewMoreButton } from '../components/contexts/cardShared';
import { DraftsTabContent } from '../components/DraftsTabContent';
import { PageWithTabs } from '../components/PageWithTabs';

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
    { value: 'drafts', label: 'Drafts' },
  ];

  const overviewPanel = (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder padding="md" h="100%">
          <Stack gap="xs" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
            <Box style={{ flex: 1, minHeight: 0 }}>
              <Text fw={600} size="sm">
                Shared with you
              </Text>
              {docsPreview.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No documents shared with you yet.
                </Text>
              ) : (
                <Stack gap={4} align="flex-start">
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
            </Box>
            <ViewMoreButton onClick={() => setActiveTab('documents')} />
          </Stack>
        </Card>
        <DraftsCard
          scopeParams={{ scope: 'shared' }}
          limit={5}
          onViewMore={() => setActiveTab('drafts')}
        />
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
    <Box>
      <PageWithTabs
        title="Shared"
        description="Contexts and documents shared with you."
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        recentScope={SHARED_SCOPE}
        recentViewMoreHref="/catalog"
      >
        {[
          <Fragment key="overview">{overviewPanel}</Fragment>,
          <Fragment key="documents">{documentsPanel}</Fragment>,
          <Fragment key="drafts">
            <DraftsTabContent scopeParams={{ scope: 'shared' }} />
          </Fragment>,
        ]}
      </PageWithTabs>
    </Box>
  );
}
