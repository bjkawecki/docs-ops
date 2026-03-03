import { Button, Card, Group, Modal, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useMe, meQueryKey } from '../hooks/useMe';
import { useRecentItems } from '../hooks/useRecentItems';
import { PageWithTabs } from '../components/PageWithTabs';
import { RecentItemsCard } from '../components/contexts';
import { notifications } from '@mantine/notifications';

type UserSpaceItem = { id: string; name: string; context?: { id: string } };
type DocItem = {
  id: string;
  title: string;
  contextId: string;
  createdAt: string;
  updatedAt: string;
};

const PERSONAL_SCOPE = { type: 'personal' as const };

export function PersonalPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  useMe();

  const personalScope = PERSONAL_SCOPE;
  const { items: recentItems } = useRecentItems(personalScope);

  const { data: userSpacesRes, isPending: spacesPending } = useQuery({
    queryKey: ['user-spaces'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/user-spaces?limit=100&offset=0');
      if (!res.ok) throw new Error('Failed to load spaces');
      return (await res.json()) as { items: UserSpaceItem[]; total: number };
    },
  });

  const { data: personalDocsRes, isPending: docsPending } = useQuery({
    queryKey: ['me', 'personal-documents'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/me/personal-documents?limit=50&offset=0');
      if (!res.ok) throw new Error('Failed to load documents');
      return (await res.json()) as { items: DocItem[]; total: number };
    },
  });

  const createSpaceMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiFetch('/api/v1/user-spaces', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err?.error ?? res.statusText);
      }
      return (await res.json()) as UserSpaceItem;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-spaces'] });
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
      closeCreate();
      setNewSpaceName('');
      notifications.show({
        title: 'Space created',
        message: 'Your personal space was created.',
        color: 'green',
      });
    },
    onError: (e: Error) => {
      notifications.show({
        title: 'Error',
        message: e.message,
        color: 'red',
      });
    },
  });

  const userSpaces = userSpacesRes?.items ?? [];
  const personalDocs = personalDocsRes?.items ?? [];
  const spacesPreview = userSpaces.slice(0, 5);
  const docsPreview = personalDocs.slice(0, 5);

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'spaces', label: 'Spaces' },
    { value: 'documents', label: 'Documents' },
  ];

  const overviewPanel = (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <RecentItemsCard items={recentItems} />
        <Card withBorder padding="md">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              My spaces
            </Text>
            {spacesPreview.length === 0 ? (
              <Text size="sm" c="dimmed">
                No spaces yet.
              </Text>
            ) : (
              <Stack gap={4}>
                {spacesPreview.map((s) => (
                  <Link
                    key={s.id}
                    to={`/user-spaces/${s.id}`}
                    style={{ fontSize: 'var(--mantine-font-size-sm)' }}
                  >
                    {s.name}
                  </Link>
                ))}
              </Stack>
            )}
            <Group justify="flex-end" mt="xs">
              <Button variant="subtle" size="xs" onClick={() => setActiveTab('spaces')}>
                View more
              </Button>
            </Group>
          </Stack>
        </Card>
        <Card withBorder padding="md">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              Documents
            </Text>
            {docsPreview.length === 0 ? (
              <Text size="sm" c="dimmed">
                No documents yet.
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

  const spacesPanel = (
    <Stack gap="md">
      {spacesPending ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            Loading spaces…
          </Text>
        </Card>
      ) : userSpaces.length === 0 ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No spaces yet. Use "Create space" to add one.
          </Text>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {userSpaces.map((s) => (
            <Card key={s.id} withBorder padding="md" component={Link} to={`/user-spaces/${s.id}`}>
              <Text fw={600} size="md">
                {s.name}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      )}
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
      ) : personalDocs.length === 0 ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No documents in your spaces yet.
          </Text>
        </Card>
      ) : (
        <Stack gap="xs">
          {personalDocs.map((d) => (
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
    <>
      <PageWithTabs
        title="Personal"
        description="Your personal documentation spaces and documents."
        actions={
          <Button variant="light" size="sm" onClick={openCreate}>
            Create space
          </Button>
        }
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {[overviewPanel, spacesPanel, documentsPanel]}
      </PageWithTabs>

      <Modal opened={createOpened} onClose={closeCreate} title="Create space" size="sm">
        <Stack gap="md">
          <TextInput
            label="Name"
            placeholder="Space name"
            value={newSpaceName}
            onChange={(e) => setNewSpaceName(e.currentTarget.value)}
            maxLength={255}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeCreate}>
              Cancel
            </Button>
            <Button
              disabled={!newSpaceName.trim()}
              loading={createSpaceMutation.isPending}
              onClick={() => createSpaceMutation.mutate(newSpaceName)}
            >
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
