import {
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Tabs,
  TextInput,
  Textarea,
  MultiSelect,
  Modal,
  ActionIcon,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { scopeToLabel, scopeToUrl } from '../lib/scopeNav';
import type { RecentScope } from '../hooks/useRecentItems';
import { useRecentItemsActions } from '../hooks/useRecentItems';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useState, type ReactNode } from 'react';
import { notifications } from '@mantine/notifications';
import {
  IconBuildingSkyscraper,
  IconListCheck,
  IconSitemap,
  IconSubtask,
  IconTarget,
  IconTrash,
  IconUser,
  IconUsersGroup,
} from '@tabler/icons-react';

type DocumentScope =
  | { type: 'personal' }
  | { type: 'company'; id: string }
  | { type: 'department'; id: string }
  | { type: 'team'; id: string };

type WritersResponse = {
  users: { userId: string; name: string }[];
  teams: { teamId: string; name: string }[];
  departments: { departmentId: string; name: string }[];
};

type DocumentResponse = {
  id: string;
  title: string;
  content: string;
  pdfUrl: string | null;
  contextId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  description: string | null;
  createdById: string | null;
  createdByName: string | null;
  writers?: WritersResponse;
  documentTags: { tag: { id: string; name: string } }[];
  canWrite: boolean;
  canDelete: boolean;
  scope: DocumentScope | null;
  contextOwnerId?: string | null;
  contextType?: 'process' | 'project';
  contextName?: string;
  contextProcessId?: string | null;
  contextProjectId?: string | null;
  contextProjectName?: string | null;
  subcontextId?: string | null;
  subcontextName?: string | null;
};

export function DocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const recentActions = useRecentItemsActions();
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTagIds, setEditTagIds] = useState<string[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [createTagOpened, { open: openCreateTag, close: closeCreateTag }] = useDisclosure(false);
  const [manageTagsOpened, { open: openManageTags, close: closeManageTags }] = useDisclosure(false);
  const [newTagName, setNewTagName] = useState('');
  const [createTagLoading, setCreateTagLoading] = useState(false);

  const { data, isPending, isError } = useQuery({
    queryKey: ['document', documentId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/documents/${documentId}`);
      if (res.status === 404) throw new Error('not-found');
      if (res.status === 403) throw new Error('forbidden');
      if (!res.ok) throw new Error('Failed to load document');
      return res.json() as Promise<DocumentResponse>;
    },
    enabled: !!documentId,
  });

  const contextOwnerId = data?.contextOwnerId ?? null;

  const { data: tagsData } = useQuery({
    queryKey: ['tags', contextOwnerId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/tags?ownerId=${contextOwnerId}`);
      if (!res.ok) throw new Error('Failed to load tags');
      return res.json() as Promise<{ id: string; name: string }[]>;
    },
    enabled: !!contextOwnerId,
  });

  const tags = tagsData ?? [];
  const tagOptions = tags.map((t) => ({ value: t.id, label: t.name }));

  useEffect(() => {
    if (data) {
      setEditTitle(data.title);
      setEditContent(data.content);
      setEditDescription(data.description ?? '');
      setEditTagIds(data.documentTags.map((dt) => dt.tag.id));
    }
  }, [data]);

  useEffect(() => {
    if (data && recentActions && data.scope) {
      const scope =
        data.scope.type === 'personal'
          ? { type: 'personal' as const }
          : data.scope.type === 'company'
            ? { type: 'company' as const, id: data.scope.id }
            : data.scope.type === 'department'
              ? { type: 'department' as const, id: data.scope.id }
              : { type: 'team' as const, id: data.scope.id };
      recentActions.addRecent({ type: 'document', id: data.id, name: data.title }, scope);
    }
  }, [data, recentActions]);

  const handleDeleteConfirm = async () => {
    if (!documentId) return;
    setDeleteLoading(true);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}`, { method: 'DELETE' });
      if (res.status === 204) {
        void queryClient.invalidateQueries({ queryKey: ['document', documentId] });
        void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
        void queryClient.invalidateQueries({ queryKey: ['contexts'] });
        closeDelete();
        notifications.show({
          title: 'Deleted',
          message: 'Document was deleted.',
          color: 'green',
        });
        void navigate('/catalog', { replace: true });
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        notifications.show({
          title: 'Error',
          message: body?.error ?? res.statusText,
          color: 'red',
        });
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSave = async () => {
    if (!documentId) return;
    setSaveLoading(true);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim() || data!.title,
          content: editContent,
          ...(editDescription.trim()
            ? { description: editDescription.trim() }
            : { description: null }),
          tagIds: editTagIds,
        }),
      });
      if (res.ok) {
        void queryClient.invalidateQueries({ queryKey: ['document', documentId] });
        void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
        void queryClient.invalidateQueries({ queryKey: ['contexts'] });
        setMode('view');
        notifications.show({
          title: 'Saved',
          message: 'Document was updated.',
          color: 'green',
        });
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        notifications.show({
          title: 'Error',
          message: body?.error ?? res.statusText,
          color: 'red',
        });
      }
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name || !contextOwnerId) return;
    setCreateTagLoading(true);
    try {
      const res = await apiFetch('/api/v1/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ownerId: contextOwnerId }),
      });
      if (res.status === 201) {
        const tag = (await res.json()) as { id: string; name: string };
        void queryClient.invalidateQueries({ queryKey: ['tags', contextOwnerId] });
        setEditTagIds((prev) => [...prev, tag.id]);
        setNewTagName('');
        closeCreateTag();
        notifications.show({
          title: 'Tag created',
          message: tag.name,
          color: 'green',
        });
      } else if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        notifications.show({
          title: 'Tag exists',
          message: body?.error ?? 'A tag with this name already exists.',
          color: 'yellow',
        });
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        notifications.show({
          title: 'Error',
          message: body?.error ?? res.statusText,
          color: 'red',
        });
      }
    } finally {
      setCreateTagLoading(false);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    const res = await apiFetch(`/api/v1/tags/${tagId}`, { method: 'DELETE' });
    if (res.status === 204) {
      if (contextOwnerId)
        void queryClient.invalidateQueries({ queryKey: ['tags', contextOwnerId] });
      setEditTagIds((prev) => prev.filter((id) => id !== tagId));
      notifications.show({ title: 'Tag deleted', message: 'Tag was removed.', color: 'green' });
    }
  };

  if (isPending) {
    return (
      <Text size="sm" c="dimmed">
        Loading…
      </Text>
    );
  }

  if (isError || !data) {
    return (
      <Text size="sm" c="red">
        Document not found or access denied.
      </Text>
    );
  }

  const docTitle = mode === 'edit' ? editTitle || 'Untitled' : data.title;
  const scope = data.scope as RecentScope | null;
  const contextMeta =
    data.contextProcessId != null
      ? {
          typeLabel: 'Prozess',
          name: data.contextName ?? 'Prozess',
          to: `/processes/${data.contextProcessId}`,
        }
      : data.subcontextId != null
        ? {
            typeLabel: 'Unterkontext',
            name: data.subcontextName ?? data.contextName ?? 'Unterkontext',
            to: `/subcontexts/${data.subcontextId}`,
          }
        : data.contextProjectId != null
          ? {
              typeLabel: 'Projekt',
              name: data.contextProjectName ?? data.contextName ?? 'Projekt',
              to: `/projects/${data.contextProjectId}`,
            }
          : null;
  const writerNames = [
    ...(data.writers?.users?.map((u) => u.name) ?? []),
    ...(data.writers?.teams?.map((t) => t.name) ?? []),
    ...(data.writers?.departments?.map((d) => d.name) ?? []),
  ].filter(Boolean);
  const scopeIcon =
    scope?.type === 'personal'
      ? IconUser
      : scope?.type === 'company'
        ? IconBuildingSkyscraper
        : scope?.type === 'department'
          ? IconSitemap
          : scope?.type === 'team'
            ? IconUsersGroup
            : null;
  const ScopeIcon = scopeIcon ?? IconUser;

  const metadataItems: ReactNode[] = [];
  if (scope) {
    metadataItems.push(
      <Group key="owner" gap="xs" align="center">
        <Text size="sm" c="dimmed" span>
          Owner:{' '}
        </Text>
        <Badge
          size="sm"
          variant="light"
          component={Link}
          to={scopeToUrl(scope)}
          style={{ textDecoration: 'none', fontWeight: 500 }}
          leftSection={scopeIcon ? <ScopeIcon size={12} /> : undefined}
        >
          {scopeToLabel(scope)}
        </Badge>
      </Group>
    );
  }
  if (contextMeta) {
    const ContextIcon =
      contextMeta.typeLabel === 'Prozess'
        ? IconListCheck
        : contextMeta.typeLabel === 'Projekt'
          ? IconTarget
          : IconSubtask;
    metadataItems.push(
      <Group key="context" gap="xs" align="center">
        <Text size="sm" c="dimmed" span>
          {contextMeta.typeLabel}:{' '}
        </Text>
        <Badge
          size="sm"
          variant="light"
          component={Link}
          to={contextMeta.to}
          style={{ textDecoration: 'none', fontWeight: 500 }}
          leftSection={<ContextIcon size={12} />}
        >
          {contextMeta.name}
        </Badge>
      </Group>
    );
  }
  if (data.publishedAt) {
    metadataItems.push(
      <Group key="pub" gap="xs" align="center">
        <Text size="sm" c="dimmed" span>
          Veröffentlicht:{' '}
        </Text>
        <Badge size="sm" variant="light">
          {new Date(data.publishedAt).toLocaleDateString('de-DE')}
        </Badge>
      </Group>
    );
  }
  if (data.createdByName) {
    metadataItems.push(
      <Group key="author" gap="xs" align="center">
        <Text size="sm" c="dimmed" span>
          Erstellt von:{' '}
        </Text>
        <Badge size="sm" variant="light">
          {data.createdByName}
        </Badge>
      </Group>
    );
  }
  if (writerNames.length > 0) {
    metadataItems.push(
      <Group key="writers" gap="xs" align="center">
        <Text size="sm" c="dimmed" span>
          Schreiber:{' '}
        </Text>
        <Badge size="sm" variant="light">
          {writerNames.join(', ')}
        </Badge>
      </Group>
    );
  }
  if (data.documentTags.length > 0) {
    metadataItems.push(
      <Group key="tags" gap="xs" align="center">
        <Text size="sm" c="dimmed" span>
          Tags:{' '}
        </Text>
        <Badge size="sm" variant="light">
          {data.documentTags.map((dt) => dt.tag.name).join(', ')}
        </Badge>
      </Group>
    );
  }

  return (
    <>
      <PageHeader
        title={docTitle}
        description={mode === 'view' && data.description ? data.description : undefined}
        metadata={
          metadataItems.length > 0 ? (
            <Group gap="md" align="center">
              {metadataItems}
            </Group>
          ) : undefined
        }
        actions={
          <Group gap="xs">
            {mode === 'edit' && (
              <>
                <Button variant="default" size="sm" onClick={() => setMode('view')}>
                  Cancel
                </Button>
                <Button size="sm" loading={saveLoading} onClick={() => void handleSave()}>
                  Save
                </Button>
              </>
            )}
            {data.canWrite && mode === 'view' && (
              <Button variant="light" size="sm" onClick={() => setMode('edit')}>
                Edit
              </Button>
            )}
            {data.canDelete && (
              <Button variant="light" size="sm" color="red" onClick={openDelete}>
                Delete
              </Button>
            )}
          </Group>
        }
      />

      <Stack gap="md">
        {mode === 'view' ? (
          <Card withBorder padding="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.content || ''}</ReactMarkdown>
          </Card>
        ) : (
          <Card withBorder padding="md">
            <Tabs defaultValue="edit">
              <Tabs.List>
                <Tabs.Tab value="edit">Edit</Tabs.Tab>
                <Tabs.Tab value="preview">Preview</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="edit" pt="md">
                <Stack gap="md">
                  <TextInput
                    label="Title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.currentTarget.value)}
                    maxLength={500}
                  />
                  <TextInput
                    label="Beschreibung"
                    placeholder="Kurzbeschreibung (optional)"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.currentTarget.value)}
                    maxLength={500}
                  />
                  <Group align="flex-end" gap="xs">
                    <MultiSelect
                      label="Tags"
                      placeholder="Select or add tags"
                      data={tagOptions}
                      value={editTagIds}
                      onChange={setEditTagIds}
                      searchable
                      clearable
                      style={{ flex: 1 }}
                    />
                    <Button variant="light" size="sm" onClick={openCreateTag}>
                      Create tag
                    </Button>
                    <Button variant="subtle" size="sm" onClick={openManageTags}>
                      Manage tags
                    </Button>
                  </Group>
                  <Textarea
                    label="Content (Markdown)"
                    value={editContent}
                    onChange={(e) => setEditContent(e.currentTarget.value)}
                    minRows={12}
                    styles={{ input: { fontFamily: 'monospace' } }}
                  />
                </Stack>
              </Tabs.Panel>
              <Tabs.Panel value="preview" pt="md">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{editContent || ''}</ReactMarkdown>
              </Tabs.Panel>
            </Tabs>
          </Card>
        )}
      </Stack>

      <Modal opened={deleteOpened} onClose={closeDelete} title="Delete document" centered>
        <Text size="sm" c="dimmed" mb="md">
          This document will be moved to trash (soft delete). Continue?
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={closeDelete}>
            Cancel
          </Button>
          <Button
            color="red"
            loading={deleteLoading}
            onClick={() => {
              void handleDeleteConfirm();
            }}
          >
            Delete
          </Button>
        </Group>
      </Modal>

      <Modal opened={createTagOpened} onClose={closeCreateTag} title="Create tag" centered>
        <Stack gap="md">
          <TextInput
            label="Tag name"
            value={newTagName}
            onChange={(e) => setNewTagName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreateTag()}
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={closeCreateTag}>
              Cancel
            </Button>
            <Button loading={createTagLoading} onClick={() => void handleCreateTag()}>
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={manageTagsOpened} onClose={closeManageTags} title="Manage tags" centered>
        <Stack gap="xs">
          {tags.length === 0 ? (
            <Text size="sm" c="dimmed">
              No tags yet. Create one when editing a document.
            </Text>
          ) : (
            tags.map((tag) => (
              <Group key={tag.id} justify="space-between">
                <Text size="sm">{tag.name}</Text>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  onClick={() => void handleDeleteTag(tag.id)}
                  aria-label={`Delete tag ${tag.name}`}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            ))
          )}
        </Stack>
      </Modal>
    </>
  );
}
