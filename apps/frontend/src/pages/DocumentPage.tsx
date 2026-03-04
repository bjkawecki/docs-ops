import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  NavLink,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Tabs,
  TextInput,
  Textarea,
  MultiSelect,
  Modal,
  ActionIcon,
  Typography,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './DocumentContent.css';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { scopeToLabel, scopeToUrl } from '../lib/scopeNav';
import type { RecentScope } from '../hooks/useRecentItems';
import { useRecentItemsActions } from '../hooks/useRecentItems';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { notifications } from '@mantine/notifications';
import {
  IconBuildingSkyscraper,
  IconListCheck,
  IconPencil,
  IconSitemap,
  IconSubtask,
  IconTarget,
  IconTrash,
  IconUser,
  IconUsersGroup,
} from '@tabler/icons-react';

/** Erzeugt URL-Slug aus Überschriftentext (für Anker-IDs). */
function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u00C0-\u024F-]/g, '');
}

/** Extrahiert Überschriften aus Markdown (Zeilen die mit # beginnen). */
function getHeadingsFromMarkdown(md: string): { level: number; text: string; id: string }[] {
  const lines = md.split('\n');
  const slugs = new Map<string, number>();
  const result: { level: number; text: string; id: string }[] = [];
  const match = /^(#{1,6})\s+(.+)$/;
  for (const line of lines) {
    const m = line.match(match);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].trim();
    const base = slugify(text) || 'heading';
    const n = (slugs.get(base) ?? 0) + 1;
    slugs.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    result.push({ level, text, id });
  }
  return result;
}

/** Text aus React-Kindern für Slug-Erzeugung. */
function getTextFromChildren(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(getTextFromChildren).join('');
  if (
    children != null &&
    typeof children === 'object' &&
    'props' in children &&
    (children as { props?: { children?: ReactNode } }).props?.children != null
  )
    return getTextFromChildren((children as { props: { children: ReactNode } }).props.children);
  return '';
}

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
  const editContentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const slugCountsRef = useRef<Record<string, number>>({});

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
    if (data?.title) {
      document.title = `${data.title} – DocsOps`;
    }
    return () => {
      document.title = 'DocsOps – Internal Documentation';
    };
  }, [data?.title]);

  useEffect(() => {
    if (mode === 'edit') {
      const t = setTimeout(() => {
        editContentTextareaRef.current?.focus();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [mode]);

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

  const headings = useMemo(() => (data ? getHeadingsFromMarkdown(data.content ?? '') : []), [data]);
  const markdownHeadingComponents = useMemo(() => {
    const makeH = (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') =>
      function HeadingWithId({ children, ...rest }: { children?: ReactNode }) {
        const text = getTextFromChildren(children ?? '');
        const base = slugify(text) || 'heading';
        const n = (slugCountsRef.current[base] ?? 0) + 1;
        slugCountsRef.current[base] = n;
        const id = n === 1 ? base : `${base}-${n}`;
        return (
          <Tag id={id} {...rest}>
            {children}
          </Tag>
        );
      };
    return {
      h1: makeH('h1'),
      h2: makeH('h2'),
      h3: makeH('h3'),
      h4: makeH('h4'),
      h5: makeH('h5'),
      h6: makeH('h6'),
    };
  }, []);

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
      <Stack gap="md">
        <Skeleton height={32} width="60%" />
        <Skeleton height={16} width="40%" />
        <Skeleton height={120} />
        <Skeleton height={16} width="90%" />
        <Skeleton height={16} width="80%" />
      </Stack>
    );
  }

  if (isError || !data) {
    return (
      <Stack gap="md">
        <Text size="sm" c="red">
          Document not found or access denied.
        </Text>
        <Group gap="xs">
          <Button variant="light" size="sm" component={Link} to="/catalog">
            Back to Catalog
          </Button>
          <Button variant="subtle" size="sm" component={Link} to="/">
            Dashboard
          </Button>
        </Group>
      </Stack>
    );
  }

  const docTitle = mode === 'edit' ? editTitle || 'Untitled' : data.title;
  const scope = data.scope as RecentScope | null;
  const contextMeta =
    data.contextProcessId != null
      ? {
          typeLabel: 'Process',
          name: data.contextName ?? 'Process',
          to: `/processes/${data.contextProcessId}`,
        }
      : data.subcontextId != null
        ? {
            typeLabel: 'Subcontext',
            name: data.subcontextName ?? data.contextName ?? 'Subcontext',
            to: `/subcontexts/${data.subcontextId}`,
          }
        : data.contextProjectId != null
          ? {
              typeLabel: 'Project',
              name: data.contextProjectName ?? data.contextName ?? 'Project',
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
      contextMeta.typeLabel === 'Process'
        ? IconListCheck
        : contextMeta.typeLabel === 'Project'
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
          Published:{' '}
        </Text>
        <Badge size="sm" variant="light">
          {new Date(data.publishedAt).toLocaleDateString(undefined)}
        </Badge>
      </Group>
    );
  }
  if (data.createdByName) {
    metadataItems.push(
      <Group key="author" gap="xs" align="center">
        <Text size="sm" c="dimmed" span>
          Created by:{' '}
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
          Writers:{' '}
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
      <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <PageHeader
          title={docTitle}
          description={mode === 'view' && data.description ? data.description : undefined}
          metadata={
            metadataItems.length > 0 ? (
              <Group gap="sm" wrap="wrap" align="center">
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
                <Button
                  variant="light"
                  size="sm"
                  leftSection={<IconPencil size={14} />}
                  onClick={() => setMode('edit')}
                >
                  Edit
                </Button>
              )}
              {data.canDelete && (
                <Button
                  variant="light"
                  size="sm"
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={openDelete}
                >
                  Delete
                </Button>
              )}
            </Group>
          }
        />

        <Stack gap="lg">
          {mode === 'view' ? (
            <Box
              style={{
                display: 'flex',
                gap: 0,
                alignItems: 'flex-start',
                flexWrap: 'nowrap',
              }}
            >
              <Box style={{ flex: 1, minWidth: 0 }} />
              <Box style={{ width: 'var(--mantine-spacing-md)', flexShrink: 0 }} />
              <Card
                variant="subtle"
                withBorder
                padding="xl"
                style={{
                  maxWidth: 'min(720px, 90vw)',
                  flexShrink: 0,
                }}
              >
                <Box
                  className="document-content"
                  style={{
                    maxWidth: '65ch',
                    margin: '0 auto',
                    padding: 'var(--mantine-spacing-xl)',
                  }}
                >
                  {(() => {
                    slugCountsRef.current = {};
                    return null;
                  })()}
                  <Typography>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownHeadingComponents}
                    >
                      {data.content || ''}
                    </ReactMarkdown>
                  </Typography>
                </Box>
              </Card>
              <Box style={{ width: 'var(--mantine-spacing-md)', flexShrink: 0 }} />
              {headings.length > 0 ? (
                <Box
                  px="lg"
                  py="lg"
                  pos="sticky"
                  top={0}
                  style={{
                    width: 260,
                    zIndex: 1000,
                  }}
                >
                  <Text
                    size="sm"
                    fw={600}
                    c="dimmed"
                    mb="sm"
                    style={{ paddingLeft: 'var(--mantine-spacing-xs)' }}
                  >
                    Table of Contents
                  </Text>
                  <Stack component="nav" gap={2}>
                    {headings.map((h) => (
                      <NavLink
                        key={h.id}
                        href={`#${h.id}`}
                        label={h.text}
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        style={{
                          paddingLeft: `calc(var(--mantine-spacing-xs) + ${(h.level - 1) * 10}px)`,
                          paddingTop: 'var(--mantine-spacing-xs)',
                          paddingBottom: 'var(--mantine-spacing-xs)',
                          paddingRight: 'var(--mantine-spacing-xs)',
                          fontSize: h.level >= 4 ? 'var(--mantine-font-size-xs)' : undefined,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      />
                    ))}
                  </Stack>
                </Box>
              ) : null}
              <Box style={{ flex: 1, minWidth: 0 }} />
            </Box>
          ) : (
            <Card withBorder padding="lg">
              <Tabs defaultValue="content">
                <Tabs.List>
                  <Tabs.Tab value="content">Content</Tabs.Tab>
                  <Tabs.Tab value="settings">Settings</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="content" pt="lg">
                  <Box style={{ minHeight: 'calc(100vh - 320px)' }}>
                    <SimpleGrid
                      cols={{ base: 1, md: 2 }}
                      spacing="xl"
                      style={{ alignItems: 'stretch' }}
                    >
                      <Box
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          height: 'max(400px, calc(100vh - 360px))',
                        }}
                      >
                        <Textarea
                          ref={editContentTextareaRef}
                          label="Markdown"
                          placeholder="Content (Markdown)"
                          value={editContent}
                          onChange={(e) => setEditContent(e.currentTarget.value)}
                          styles={{
                            root: {
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              minHeight: 0,
                            },
                            input: {
                              fontFamily: 'monospace',
                              height: '100%',
                              minHeight: 200,
                              boxSizing: 'border-box',
                            },
                            wrapper: {
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              minHeight: 0,
                            },
                          }}
                        />
                      </Box>
                      <Box
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          height: 'max(400px, calc(100vh - 360px))',
                        }}
                      >
                        <Text size="sm" c="dimmed" fw={500} mb="sm">
                          Preview
                        </Text>
                        <Box style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                          <Box style={{ maxWidth: '65ch', padding: 'var(--mantine-spacing-md)' }}>
                            <Typography>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {editContent || ''}
                              </ReactMarkdown>
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    </SimpleGrid>
                  </Box>
                </Tabs.Panel>
                <Tabs.Panel value="settings" pt="lg">
                  <Stack gap="md">
                    <TextInput
                      label="Title"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.currentTarget.value)}
                      maxLength={500}
                    />
                    <TextInput
                      label="Description"
                      placeholder="Short description (optional)"
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
                  </Stack>
                </Tabs.Panel>
              </Tabs>
            </Card>
          )}
        </Stack>
      </Box>

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
