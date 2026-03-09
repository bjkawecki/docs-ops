import {
  Anchor,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
  MultiSelect,
  Title,
  Flex,
  Container,
  Breadcrumbs,
  Menu,
  ActionIcon,
  Table,
  NavLink,
  Badge,
  Box,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useMe } from '../hooks/useMe';
import { useRecentItemsActions, type RecentScope } from '../hooks/useRecentItems';
import { scopeToLabel, scopeToUrl } from '../lib/scopeNav';
import { EditContextNameModal } from '../components/contexts/EditContextNameModal';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconChevronRight,
  IconDotsVertical,
  IconPencil,
  IconArchive,
  IconTrash,
  IconBuildingSkyscraper,
  IconSitemap,
  IconUsersGroup,
  IconUser,
  IconRoute,
  IconBriefcase,
} from '@tabler/icons-react';

type ContextType = 'process' | 'project';

type OwnerResponse = {
  companyId: string | null;
  departmentId: string | null;
  teamId: string | null;
  ownerUserId?: string | null;
  displayName?: string | null;
};
type ProcessResponse = {
  id: string;
  name: string;
  contextId: string;
  ownerId?: string;
  owner: OwnerResponse;
  canWriteContext?: boolean;
};
type SubcontextItem = { id: string; name: string; contextId: string };
type ProjectResponse = {
  id: string;
  name: string;
  contextId: string;
  ownerId?: string;
  owner: OwnerResponse;
  canWriteContext?: boolean;
  subcontexts?: SubcontextItem[];
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

/** Scope für Metadaten-Link (inkl. Personal). */
function ownerToScopeForBreadcrumb(owner: OwnerResponse): RecentScope | null {
  if (owner.ownerUserId) return { type: 'personal' };
  return ownerToScope(owner);
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
  const [newSubcontextOpened, { open: openNewSubcontext, close: closeNewSubcontext }] =
    useDisclosure(false);
  const [newSubcontextName, setNewSubcontextName] = useState('');
  const [newSubcontextLoading, setNewSubcontextLoading] = useState(false);

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

  const contextOwnerId = data && 'ownerId' in data ? data.ownerId : undefined;

  const { data: tagsData } = useQuery({
    queryKey: ['tags', contextOwnerId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/tags?ownerId=${contextOwnerId}`);
      if (!res.ok) throw new Error('Failed to load tags');
      return res.json() as Promise<{ id: string; name: string }[]>;
    },
    enabled: !!contextOwnerId,
  });

  const documents = documentsData?.items ?? [];
  const tagOptions = (tagsData ?? []).map((t) => ({ value: t.id, label: t.name }));

  const scopeParam = data?.owner?.companyId
    ? `companyId=${data.owner.companyId}`
    : data?.owner?.departmentId
      ? `departmentId=${data.owner.departmentId}`
      : data?.owner?.teamId
        ? `teamId=${data.owner.teamId}`
        : data?.owner?.ownerUserId
          ? `ownerUserId=${data.owner.ownerUserId}`
          : '';

  const { data: siblingsData } = useQuery({
    queryKey: [type, 'siblings', scopeParam],
    queryFn: async () => {
      const res = await apiFetch(`${endpoint}?limit=100&offset=0&${scopeParam}`);
      if (!res.ok) throw new Error('Failed to load siblings');
      return res.json() as Promise<{ items: { id: string; name: string }[] }>;
    },
    enabled: !!scopeParam,
  });
  const siblings = siblingsData?.items ?? [];

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

  const handleArchive = async () => {
    const res = await apiFetch(`${endpoint}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivedAt: new Date().toISOString() }),
    });
    if (res.ok) {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['me', 'archive'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'trash'] });
      notifications.show({ title: 'Archived', message: 'Context was archived.', color: 'green' });
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      notifications.show({ title: 'Error', message: body?.error ?? res.statusText, color: 'red' });
    }
  };

  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    try {
      const res = await apiFetch(`${endpoint}/${id}`, { method: 'DELETE' });
      if (res.status === 204) {
        void queryClient.invalidateQueries({ queryKey });
        void queryClient.invalidateQueries({ queryKey: ['me', 'trash'] });
        closeDelete();
        void navigate('/company', { replace: true });
        notifications.show({
          title: 'Moved to trash',
          message: 'Context can be restored from the Trash tab.',
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

  const handleCreateSubcontext = async () => {
    if (type !== 'project' || !id) return;
    const name = newSubcontextName.trim();
    if (!name) {
      notifications.show({
        title: 'Name required',
        message: 'Please enter a name for the subcontext.',
        color: 'yellow',
      });
      return;
    }
    setNewSubcontextLoading(true);
    try {
      const res = await apiFetch(`/api/v1/projects/${id}/subcontexts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.status === 201) {
        void queryClient.invalidateQueries({ queryKey: [type, id] });
        closeNewSubcontext();
        setNewSubcontextName('');
        notifications.show({
          title: 'Subcontext created',
          message: 'The subcontext was added.',
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
      setNewSubcontextLoading(false);
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

  const typeLabel = type === 'process' ? 'Processes' : 'Projects';
  const typeTab = type === 'process' ? 'processes' : 'projects';
  const scope = ownerToScopeForBreadcrumb(data.owner);

  const scopeUrlWithTab = scope ? `${scopeToUrl(scope)}?tab=${typeTab}` : `/?tab=${typeTab}`;
  const scopeName = data.owner.displayName ?? (scope ? scopeToLabel(scope) : 'Overview');
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
          <Text size="sm" c="dimmed">
            {typeLabel}
          </Text>
        </Breadcrumbs>
        <Flex justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Group gap="sm" align="center">
            {type === 'process' ? (
              <IconRoute size={32} stroke={1.5} color="var(--mantine-color-dimmed)" />
            ) : (
              <IconBriefcase size={32} stroke={1.5} color="var(--mantine-color-dimmed)" />
            )}
            <Title order={1}>{data.name}</Title>
          </Group>
          <Group gap="xs">
            {data.canWriteContext && (
              <Button variant="light" size="sm" onClick={openNewDoc}>
                New draft
              </Button>
            )}
            {canManage && (
              <>
                <ActionIcon
                  variant="light"
                  size="36"
                  aria-label="Edit context"
                  onClick={handleEditClick}
                >
                  <IconPencil size={18} />
                </ActionIcon>
                <Menu shadow="md" position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="default" size="36" aria-label="More actions">
                      <IconDotsVertical size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconArchive size={14} />}
                      onClick={() => void handleArchive()}
                    >
                      Archive
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={openDelete}
                    >
                      Move to trash
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </>
            )}
          </Group>
        </Flex>
      </Stack>

      <Flex
        direction={{ base: 'column', lg: 'row' }}
        gap={{ base: 'xl', lg: 80 }}
        align="flex-start"
      >
        <Box w={{ base: '100%', lg: 280 }} style={{ flexShrink: 0 }}>
          <Text
            tt="uppercase"
            fz="xs"
            fw={600}
            c="dimmed"
            mb="sm"
            style={{ paddingLeft: 'var(--mantine-spacing-xs)' }}
          >
            {type === 'process' ? 'All Processes' : 'All Projects'}
          </Text>
          <Stack component="nav" gap={2}>
            {siblings.map((sibling) => (
              <NavLink
                key={sibling.id}
                component={Link}
                to={`/${type === 'process' ? 'processes' : 'projects'}/${sibling.id}`}
                label={sibling.name}
                active={sibling.id === id}
                variant="light"
                style={{ borderRadius: 'var(--mantine-radius-sm)' }}
              />
            ))}
          </Stack>
        </Box>

        <Box style={{ flex: 1, minWidth: 0, width: '100%' }}>
          <Stack gap="xl">
            <Box>
              <Text fw={600} size="lg" mb="md">
                Documents
              </Text>
              {documents.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No documents yet.
                </Text>
              ) : (
                <Table highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: '60%' }}>Title</Table.Th>
                      <Table.Th style={{ width: '25%' }}>Tags</Table.Th>
                      <Table.Th style={{ width: '15%' }}>Last updated</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {documents.map((doc) => (
                      <Table.Tr
                        key={doc.id}
                        onClick={() => {
                          void navigate(`/documents/${doc.id}`);
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <Table.Td>
                          <Text fw={500}>{doc.title}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            {doc.documentTags.map((dt) => (
                              <Badge key={dt.tag.id} size="sm" variant="light" color="gray">
                                {dt.tag.name}
                              </Badge>
                            ))}
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {new Date(doc.updatedAt).toLocaleDateString()}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Box>

            {type === 'project' && (
              <Box>
                <Group justify="space-between" wrap="nowrap" mb="md">
                  <Text fw={600} size="lg">
                    Unterkontexte
                  </Text>
                  {data.canWriteContext && (
                    <Button variant="light" size="xs" onClick={openNewSubcontext}>
                      Unterkontext anlegen
                    </Button>
                  )}
                </Group>
                {((data as ProjectResponse).subcontexts?.length ?? 0) === 0 ? (
                  <Text size="sm" c="dimmed">
                    No subcontexts yet.
                  </Text>
                ) : (
                  <Stack gap={4}>
                    {((data as ProjectResponse).subcontexts ?? []).map((sub) => (
                      <Link
                        key={sub.id}
                        to={`/subcontexts/${sub.id}`}
                        style={{
                          fontSize: 'var(--mantine-font-size-sm)',
                          textDecoration: 'none',
                          fontWeight: 500,
                          color: 'inherit',
                        }}
                      >
                        {sub.name}
                      </Link>
                    ))}
                  </Stack>
                )}
              </Box>
            )}
          </Stack>
        </Box>
      </Flex>

      <Modal
        opened={newSubcontextOpened}
        onClose={closeNewSubcontext}
        title="Unterkontext anlegen"
        size="sm"
      >
        <Stack gap="md">
          <TextInput
            label="Name"
            value={newSubcontextName}
            onChange={(e) => setNewSubcontextName(e.currentTarget.value)}
            placeholder="z. B. Protokolle, Meilensteine"
            required
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={closeNewSubcontext}>
              Cancel
            </Button>
            <Button loading={newSubcontextLoading} onClick={() => void handleCreateSubcontext()}>
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>

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

      <EditContextNameModal
        opened={editOpened}
        onClose={closeEdit}
        type={type}
        contextId={id}
        currentName={editName}
        onSuccess={handleEditSuccess}
      />

      <Modal opened={deleteOpened} onClose={closeDelete} title="Move to trash" centered>
        <Text size="sm" c="dimmed" mb="md">
          This context and its documents will be moved to trash. You can restore them from the Trash
          tab.
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
            Move to trash
          </Button>
        </Group>
      </Modal>
    </Container>
  );
}
