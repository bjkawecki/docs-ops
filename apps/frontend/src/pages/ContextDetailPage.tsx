import { Button, Card, Group, Stack, Text, TextInput, Textarea, MultiSelect } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useMe } from '../hooks/useMe';
import { useRecentItemsActions, type RecentScope } from '../hooks/useRecentItems';
import { PageHeader } from '../components/PageHeader';
import { EditContextNameModal } from '../components/contexts/EditContextNameModal';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';

type ContextType = 'process' | 'project';

type OwnerResponse = {
  companyId: string | null;
  departmentId: string | null;
  teamId: string | null;
};
type ProcessResponse = {
  id: string;
  name: string;
  contextId: string;
  owner: OwnerResponse;
  canWriteContext?: boolean;
};
type ProjectResponse = {
  id: string;
  name: string;
  contextId: string;
  owner: OwnerResponse;
  canWriteContext?: boolean;
};

type ContextDocument = {
  id: string;
  title: string;
  contextId: string;
  createdAt: string;
  updatedAt: string;
  documentTags: { tag: { id: string; name: string } }[];
};

function ownerToScope(owner: OwnerResponse): RecentScope | null {
  if (owner.companyId) return { type: 'company', id: owner.companyId };
  if (owner.departmentId) return { type: 'department', id: owner.departmentId };
  if (owner.teamId) return { type: 'team', id: owner.teamId };
  return null;
}

export interface ContextDetailPageProps {
  type: ContextType;
  id: string;
}

export function ContextDetailPage({ type, id }: ContextDetailPageProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const recentActions = useRecentItemsActions();
  const canManage = (me?.identity?.companyLeads?.length ?? 0) > 0 || me?.user?.isAdmin === true;

  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const [editName, setEditName] = useState('');
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [newDocOpened, { open: openNewDoc, close: closeNewDoc }] = useDisclosure(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [newDocTagIds, setNewDocTagIds] = useState<string[]>([]);
  const [newDocLoading, setNewDocLoading] = useState(false);

  const endpoint = type === 'process' ? '/api/v1/processes' : '/api/v1/projects';
  const queryKey = type === 'process' ? ['processes'] : ['projects'];

  const { data, isPending, isError } = useQuery({
    queryKey: [type, id],
    queryFn: async () => {
      const res = await apiFetch(`${endpoint}/${id}`);
      if (!res.ok) throw new Error('Context not found');
      return res.json() as Promise<ProcessResponse | ProjectResponse>;
    },
    enabled: !!id,
  });

  const contextId = data?.contextId;
  const { data: documentsData } = useQuery({
    queryKey: ['contexts', contextId, 'documents'],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/contexts/${contextId}/documents?limit=100&offset=0`);
      if (!res.ok) throw new Error('Failed to load documents');
      return res.json() as Promise<{
        items: ContextDocument[];
        total: number;
        limit: number;
        offset: number;
      }>;
    },
    enabled: !!contextId,
  });

  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/tags');
      if (!res.ok) throw new Error('Failed to load tags');
      return res.json() as Promise<{ id: string; name: string }[]>;
    },
  });

  const documents = documentsData?.items ?? [];
  const tagOptions = (tagsData ?? []).map((t) => ({ value: t.id, label: t.name }));

  useEffect(() => {
    if (data && recentActions) {
      const scope = ownerToScope(data.owner);
      if (scope) recentActions.addRecent({ type, id: data.id, name: data.name }, scope);
    }
  }, [data, type, id, recentActions]);

  const invalidateAndClose = () => {
    void queryClient.invalidateQueries({ queryKey });
    closeEdit();
    closeDelete();
  };

  const handleEditClick = () => {
    if (data) {
      setEditName(data.name);
      openEdit();
    }
  };

  const handleEditSuccess = () => {
    invalidateAndClose();
    if (data) setEditName(data.name);
    void queryClient.invalidateQueries({ queryKey: [type, id] });
    notifications.show({
      title: 'Saved',
      message: 'Name was updated.',
      color: 'green',
    });
  };

  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    try {
      const res = await apiFetch(`${endpoint}/${id}`, { method: 'DELETE' });
      if (res.status === 204) {
        void queryClient.invalidateQueries({ queryKey });
        closeDelete();
        void navigate('/company', { replace: true });
        notifications.show({
          title: 'Deleted',
          message: 'Context was deleted.',
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
      setDeleteLoading(false);
    }
  };

  const handleCreateDocument = async () => {
    if (!data?.contextId) return;
    const title = newDocTitle.trim();
    if (!title) {
      notifications.show({
        title: 'Title required',
        message: 'Please enter a document title.',
        color: 'yellow',
      });
      return;
    }
    setNewDocLoading(true);
    try {
      const res = await apiFetch('/api/v1/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: newDocContent,
          contextId: data.contextId,
          tagIds: newDocTagIds,
        }),
      });
      if (res.status === 201) {
        const doc = (await res.json()) as { id: string };
        void queryClient.invalidateQueries({ queryKey: ['contexts', data.contextId, 'documents'] });
        void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
        closeNewDoc();
        setNewDocTitle('');
        setNewDocContent('');
        setNewDocTagIds([]);
        notifications.show({
          title: 'Document created',
          message: 'Redirecting to document.',
          color: 'green',
        });
        void navigate(`/documents/${doc.id}`);
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        notifications.show({
          title: 'Error',
          message: body?.error ?? res.statusText,
          color: 'red',
        });
      }
    } finally {
      setNewDocLoading(false);
    }
  };

  if (isPending)
    return (
      <Text size="sm" c="dimmed">
        Loading…
      </Text>
    );
  if (isError || !data)
    return (
      <Text size="sm" c="red">
        Context not found.
      </Text>
    );

  const typeLabel = type === 'process' ? 'Process' : 'Project';

  return (
    <>
      <PageHeader
        title={data.name}
        description={`${typeLabel} · Company`}
        actions={
          <Group gap="xs">
            {data.canWriteContext && (
              <Button variant="light" size="sm" onClick={openNewDoc}>
                New document
              </Button>
            )}
            {canManage && (
              <>
                <Button variant="light" size="sm" onClick={handleEditClick}>
                  Edit
                </Button>
                <Button variant="light" size="sm" color="red" onClick={openDelete}>
                  Delete
                </Button>
              </>
            )}
          </Group>
        }
      />

      <Stack gap="md">
        <Card withBorder padding="md">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              Documents
            </Text>
            {documents.length === 0 ? (
              <Text size="sm" c="dimmed">
                No documents yet.
              </Text>
            ) : (
              <Stack gap={4}>
                {documents.map((doc) => (
                  <Group key={doc.id} justify="space-between" wrap="nowrap">
                    <Link
                      to={`/documents/${doc.id}`}
                      style={{ fontSize: 'var(--mantine-font-size-sm)', textDecoration: 'none' }}
                    >
                      {doc.title}
                    </Link>
                    <Group gap="xs" wrap="nowrap">
                      {doc.documentTags.map((dt) => (
                        <Text key={dt.tag.id} size="xs" c="dimmed" span>
                          {dt.tag.name}
                        </Text>
                      ))}
                      <Text size="xs" c="dimmed">
                        {new Date(doc.updatedAt).toLocaleDateString()}
                      </Text>
                    </Group>
                  </Group>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>
      </Stack>

      <Modal opened={newDocOpened} onClose={closeNewDoc} title="New document" centered>
        <Stack gap="md">
          <TextInput
            label="Title"
            value={newDocTitle}
            onChange={(e) => setNewDocTitle(e.currentTarget.value)}
            placeholder="Document title"
            required
          />
          <Textarea
            label="Content (Markdown)"
            value={newDocContent}
            onChange={(e) => setNewDocContent(e.currentTarget.value)}
            placeholder="Optional content"
            minRows={4}
          />
          <MultiSelect
            label="Tags"
            data={tagOptions}
            value={newDocTagIds}
            onChange={setNewDocTagIds}
            placeholder="Select tags"
            searchable
            clearable
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={closeNewDoc}>
              Cancel
            </Button>
            <Button loading={newDocLoading} onClick={() => void handleCreateDocument()}>
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>

      <EditContextNameModal
        opened={editOpened}
        onClose={closeEdit}
        type={type}
        contextId={id}
        currentName={editName}
        onSuccess={handleEditSuccess}
      />

      <Modal opened={deleteOpened} onClose={closeDelete} title="Delete context" centered>
        <Text size="sm" c="dimmed" mb="md">
          This context and related data will be permanently deleted. Continue?
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
    </>
  );
}
