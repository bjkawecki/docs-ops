import {
  Anchor,
  Button,
  Card,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
  MultiSelect,
  Modal,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useRecentItemsActions, type RecentScope } from '../hooks/useRecentItems';
import { PageHeader } from '../components/PageHeader';
import { scopeToLabel, scopeToUrl } from '../lib/scopeNav';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useState, type ReactNode } from 'react';
import { notifications } from '@mantine/notifications';

type SubcontextResponse = {
  id: string;
  name: string;
  contextId: string;
  projectId: string;
  project: {
    id: string;
    name: string;
    owner?: {
      companyId?: string;
      departmentId?: string;
      teamId?: string;
      ownerUserId?: string | null;
    };
  };
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

function projectOwnerToScope(project: {
  owner?: {
    companyId?: string;
    departmentId?: string;
    teamId?: string;
    ownerUserId?: string | null;
  };
}): RecentScope | null {
  const o = project?.owner;
  if (!o) return null;
  if (o.ownerUserId != null) return { type: 'personal' };
  if (o.companyId) return { type: 'company', id: o.companyId };
  if (o.departmentId) return { type: 'department', id: o.departmentId };
  if (o.teamId) return { type: 'team', id: o.teamId };
  return null;
}

export function SubcontextDetailPage() {
  const { subcontextId } = useParams<{ subcontextId: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const recentActions = useRecentItemsActions();

  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const [editName, setEditName] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [newDocOpened, { open: openNewDoc, close: closeNewDoc }] = useDisclosure(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [newDocTagIds, setNewDocTagIds] = useState<string[]>([]);
  const [newDocLoading, setNewDocLoading] = useState(false);

  const { data, isPending, isError } = useQuery({
    queryKey: ['subcontext', subcontextId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/subcontexts/${subcontextId}`);
      if (!res.ok) throw new Error('Subcontext not found');
      return res.json() as Promise<SubcontextResponse>;
    },
    enabled: !!subcontextId,
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
    queryKey: ['tags', contextId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/tags?contextId=${contextId}`);
      if (!res.ok) throw new Error('Failed to load tags');
      return res.json() as Promise<{ id: string; name: string }[]>;
    },
    enabled: !!contextId,
  });

  const documents = documentsData?.items ?? [];
  const tagOptions = (tagsData ?? []).map((t) => ({ value: t.id, label: t.name }));

  useEffect(() => {
    if (data && recentActions) {
      const scope = projectOwnerToScope(
        data.project as { owner?: { companyId?: string; departmentId?: string; teamId?: string } }
      );
      if (scope)
        recentActions.addRecent(
          { type: 'project', id: data.project.id, name: data.project.name },
          scope
        );
    }
  }, [data, recentActions]);

  const handleEditClick = () => {
    if (data) {
      setEditName(data.name);
      openEdit();
    }
  };

  const handleEditSuccess = async () => {
    if (!subcontextId || !editName.trim()) return;
    setEditLoading(true);
    try {
      const res = await apiFetch(`/api/v1/subcontexts/${subcontextId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        void queryClient.invalidateQueries({ queryKey: ['subcontext', subcontextId] });
        closeEdit();
        notifications.show({ title: 'Saved', message: 'Name was updated.', color: 'green' });
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        notifications.show({
          title: 'Error',
          message: body?.error ?? res.statusText,
          color: 'red',
        });
      }
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!subcontextId || !data?.project?.id) return;
    setDeleteLoading(true);
    try {
      const res = await apiFetch(`/api/v1/subcontexts/${subcontextId}`, { method: 'DELETE' });
      if (res.status === 204) {
        void queryClient.invalidateQueries({ queryKey: ['project', data.project.id] });
        closeDelete();
        void navigate(`/projects/${data.project.id}`, { replace: true });
        notifications.show({
          title: 'Deleted',
          message: 'Subcontext was deleted.',
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
        Subcontext not found.
      </Text>
    );

  const scope = data.project ? projectOwnerToScope(data.project) : null;
  const projectId = data.project?.id;
  const projectName = data.project?.name ?? 'Project';
  const metadataParts: ReactNode[] = [];
  if (scope) {
    metadataParts.push(
      <Anchor key="scope" component={Link} to={scopeToUrl(scope)} size="sm" c="dimmed">
        {scopeToLabel(scope)}
      </Anchor>
    );
  }
  if (projectId) {
    metadataParts.push(
      metadataParts.length > 0 ? ' · ' : null,
      <Anchor key="project" component={Link} to={`/projects/${projectId}`} size="sm" c="dimmed">
        Projekt: {projectName}
      </Anchor>
    );
  }
  metadataParts.push(
    metadataParts.length > 0 ? ' · ' : null,
    <Text key="type" size="sm" c="dimmed" span>
      Subcontext
    </Text>
  );
  const metadata = <Group gap={4}>{metadataParts.filter(Boolean)}</Group>;

  return (
    <>
      <PageHeader
        title={data.name}
        metadata={metadata}
        actions={
          <Group gap="xs">
            {data.canWriteContext && (
              <Button variant="light" size="sm" onClick={openNewDoc}>
                New document
              </Button>
            )}
            {data.canWriteContext && (
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

      <Modal opened={editOpened} onClose={closeEdit} title="Edit subcontext name" size="sm">
        <Stack gap="md">
          <TextInput
            label="Name"
            value={editName}
            onChange={(e) => setEditName(e.currentTarget.value)}
            placeholder="Subcontext name"
            required
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={closeEdit}>
              Cancel
            </Button>
            <Button loading={editLoading} onClick={() => void handleEditSuccess()}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={deleteOpened} onClose={closeDelete} title="Delete subcontext" centered>
        <Text size="sm" c="dimmed" mb="md">
          This subcontext and its documents will be permanently deleted. Continue?
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={closeDelete}>
            Cancel
          </Button>
          <Button color="red" loading={deleteLoading} onClick={() => void handleDeleteConfirm()}>
            Delete
          </Button>
        </Group>
      </Modal>
    </>
  );
}
