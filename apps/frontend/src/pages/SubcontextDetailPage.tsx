import {
  Anchor,
  Box,
  Button,
  Card,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
  MultiSelect,
  Modal,
  Title,
  Flex,
  Container,
  Breadcrumbs,
  Paper,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useRecentItemsActions, type RecentScope } from '../hooks/useRecentItems';
import { scopeToLabel, scopeToUrl } from '../lib/scopeNav';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { notifications } from '@mantine/notifications';
import {
  IconChevronRight,
  IconBuildingSkyscraper,
  IconSitemap,
  IconUsersGroup,
  IconUser,
  IconSubtask,
} from '@tabler/icons-react';
import { ContextDocumentsTable } from '../components/contexts/ContextDocumentsTable';
import { ProjectSiblingSubnav } from '../components/contexts/ProjectSiblingSubnav';

type SubcontextResponse = {
  id: string;
  name: string;
  contextId: string;
  projectId: string;
  project: {
    id: string;
    name: string;
    ownerId?: string;
    owner?: {
      companyId?: string | null;
      departmentId?: string | null;
      teamId?: string | null;
      ownerUserId?: string | null;
      displayName?: string | null;
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
    companyId?: string | null;
    departmentId?: string | null;
    teamId?: string | null;
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

function ownerToScopeForBreadcrumb(owner: {
  companyId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
  ownerUserId?: string | null;
}): RecentScope | null {
  if (owner.ownerUserId) return { type: 'personal' };
  if (owner.companyId) return { type: 'company', id: owner.companyId };
  if (owner.departmentId) return { type: 'department', id: owner.departmentId };
  if (owner.teamId) return { type: 'team', id: owner.teamId };
  return null;
}

export function SubcontextDetailPage() {
  const { projectId: projectIdParam, subcontextId } = useParams<{
    projectId: string;
    subcontextId: string;
  }>();
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
    queryKey: ['subcontext', projectIdParam, subcontextId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/subcontexts/${subcontextId}`);
      if (!res.ok) throw new Error('Subcontext not found');
      return res.json() as Promise<SubcontextResponse>;
    },
    enabled: !!subcontextId,
  });

  const contextId = data?.contextId;
  const projectOwnerId = data?.project?.ownerId;

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
    queryKey: ['tags', projectOwnerId ?? contextId, 'subcontext'],
    queryFn: async () => {
      if (projectOwnerId) {
        const res = await apiFetch(`/api/v1/tags?ownerId=${projectOwnerId}`);
        if (!res.ok) throw new Error('Failed to load tags');
        return res.json() as Promise<{ id: string; name: string }[]>;
      }
      if (!contextId) return [];
      const res = await apiFetch(`/api/v1/tags?contextId=${contextId}`);
      if (!res.ok) throw new Error('Failed to load tags');
      return res.json() as Promise<{ id: string; name: string }[]>;
    },
    enabled: !!(projectOwnerId ?? contextId),
  });

  const scopeParam =
    data?.project?.owner?.companyId != null
      ? `companyId=${data.project.owner.companyId}`
      : data?.project?.owner?.departmentId != null
        ? `departmentId=${data.project.owner.departmentId}`
        : data?.project?.owner?.teamId != null
          ? `teamId=${data.project.owner.teamId}`
          : data?.project?.owner?.ownerUserId != null
            ? `ownerUserId=${data.project.owner.ownerUserId}`
            : '';

  const { data: siblingsData } = useQuery({
    queryKey: ['project', 'siblings', scopeParam],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/projects?limit=100&offset=0&${scopeParam}`);
      if (!res.ok) throw new Error('Failed to load siblings');
      return res.json() as Promise<{
        items: { id: string; name: string; subcontexts?: { id: string; name: string }[] }[];
      }>;
    },
    enabled: !!scopeParam,
  });
  const siblings = siblingsData?.items ?? [];

  const documents = documentsData?.items ?? [];
  const tagOptions = (tagsData ?? []).map((t) => ({ value: t.id, label: t.name }));

  useEffect(() => {
    if (data && recentActions) {
      const scope = projectOwnerToScope(data.project);
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
        const projectPk = data?.project.id;
        void queryClient.invalidateQueries({
          queryKey: ['subcontext', projectIdParam, subcontextId],
        });
        void queryClient.invalidateQueries({ queryKey: ['project', 'siblings', scopeParam] });
        if (projectPk) void queryClient.invalidateQueries({ queryKey: ['project', projectPk] });
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
        void queryClient.invalidateQueries({ queryKey: ['project', 'siblings', scopeParam] });
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
          title: 'Draft created',
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

  if (!subcontextId || !projectIdParam) return null;

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

  if (data.project.id !== projectIdParam) {
    return <Navigate to={`/projects/${data.project.id}/subcontexts/${subcontextId}`} replace />;
  }

  const owner = data.project.owner;
  const scope = owner ? ownerToScopeForBreadcrumb(owner) : null;
  const scopeUrlWithTab = scope ? `${scopeToUrl(scope)}?tab=projects` : '/?tab=projects';
  const scopeName = owner?.displayName ?? (scope ? scopeToLabel(scope) : 'Overview');
  const ScopeIcon =
    scope?.type === 'company'
      ? IconBuildingSkyscraper
      : scope?.type === 'department'
        ? IconSitemap
        : scope?.type === 'team'
          ? IconUsersGroup
          : IconUser;

  return (
    <Container fluid maw={1600} px="md" mb="xl">
      <Stack gap="lg" mb="xl" mt="md">
        <Breadcrumbs separator={<IconChevronRight size={14} color="var(--mantine-color-dimmed)" />}>
          <Anchor component={Link} to={scopeUrlWithTab} c="dimmed" size="sm">
            <Group gap={4} align="center" wrap="nowrap">
              <ScopeIcon size={14} />
              <span>{scopeName}</span>
            </Group>
          </Anchor>
          <Anchor component={Link} to={`/projects/${data.project.id}`} c="dimmed" size="sm">
            {data.project.name}
          </Anchor>
          <Text size="sm" c="dimmed">
            {data.name}
          </Text>
        </Breadcrumbs>
        <Flex justify="space-between" align="flex-start" wrap="wrap" gap="lg">
          <Group gap="sm" align="center">
            <IconSubtask size={32} stroke={1.5} color="var(--mantine-color-dimmed)" />
            <Title order={1}>{data.name}</Title>
          </Group>
          <Group gap="xs">
            {data.canWriteContext && (
              <Button variant="light" size="sm" onClick={openNewDoc}>
                New draft
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
        </Flex>
      </Stack>

      <Paper withBorder={false} p="lg" radius="md">
        <Flex
          direction={{ base: 'column', lg: 'row' }}
          gap={{ base: 'xl', lg: 48 }}
          align="flex-start"
        >
          <ProjectSiblingSubnav variant="project" siblings={siblings} />
          <Card withBorder padding="md" style={{ flex: 1, minWidth: 0, width: '100%' }}>
            <Stack gap="xl">
              <Box data-context-docs-table>
                <Text tt="uppercase" fz="xs" fw={600} c="dimmed" mb="sm">
                  Documents
                </Text>
                <ContextDocumentsTable documents={documents} />
              </Box>
            </Stack>
          </Card>
        </Flex>
      </Paper>

      <Modal opened={newDocOpened} onClose={closeNewDoc} title="New draft" centered>
        <Stack gap="md">
          <TextInput
            label="Title"
            value={newDocTitle}
            onChange={(e) => setNewDocTitle(e.currentTarget.value)}
            placeholder="Draft title"
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
    </Container>
  );
}
