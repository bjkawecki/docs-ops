import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Modal,
  NavLink,
  Select,
  Skeleton,
  Stack,
  Text,
  Tabs,
  TextInput,
  MultiSelect,
  ActionIcon,
  Typography,
  Menu,
  Container,
  Flex,
  Paper,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './DocumentContent.css';
import { apiFetch } from '../api/client';
import { meQueryKey, useMe } from '../hooks/useMe';
import { DocumentCommentsSection } from '../components/documents/DocumentCommentsSection';
import { DocumentDocBreadcrumbs } from '../components/documents/DocumentDocBreadcrumbs';
import { PageHeader } from '../components/PageHeader';
import { scopeToUrl } from '../lib/scopeNav';
import { useRecentItemsActions } from '../hooks/useRecentItems';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { notifications } from '@mantine/notifications';
import {
  IconArchive,
  IconArchiveOff,
  IconPencil,
  IconTarget,
  IconTrash,
  IconCloudUpload,
  IconHistory,
  IconDotsVertical,
  IconFileText,
  IconDownload,
} from '@tabler/icons-react';
import type { BlockDocumentV0 } from '../api/document-types';
import {
  DocumentBlocksPreview,
  blockDocumentToPlainPreview,
} from '../components/documents/DocumentBlocksPreview';
import { DocumentLeadDraftPanel } from '../components/documents/DocumentLeadDraftPanel';
import { DocumentSuggestionsPanel } from '../components/documents/DocumentSuggestionsPanel';

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
  | { type: 'personal'; name?: string | null }
  | { type: 'company'; id: string; name?: string | null }
  | { type: 'department'; id: string; name?: string | null }
  | { type: 'team'; id: string; name?: string | null };

type WritersResponse = {
  users: { userId: string; name: string }[];
  teams: { teamId: string; name: string }[];
  departments: { departmentId: string; name: string }[];
};

type DocumentResponse = {
  id: string;
  title: string;
  content: string;
  /** Lead-Draft-Revision (Block-System, EPIC-8). */
  draftRevision?: number;
  /** Lead-Draft-Blocks; null wenn noch nicht initialisiert. */
  blocks?: BlockDocumentV0 | null;
  publishedBlocks?: BlockDocumentV0 | null;
  publishedBlocksSchemaVersion?: number | null;
  pdfUrl: string | null;
  contextId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  currentPublishedVersionId: string | null;
  currentPublishedVersionNumber: number | null;
  description: string | null;
  createdById: string | null;
  createdByName: string | null;
  writers?: WritersResponse;
  documentTags: { tag: { id: string; name: string } }[];
  canWrite: boolean;
  canDelete: boolean;
  canModerateComments?: boolean;
  canPublish?: boolean;
  scope: DocumentScope | null;
  contextOwnerId?: string | null;
  contextType?: 'process' | 'project' | 'subcontext';
  contextName?: string;
  contextProcessId?: string | null;
  contextProjectId?: string | null;
  contextProjectName?: string | null;
  subcontextId?: string | null;
  subcontextName?: string | null;
};

type PdfExportJobStatusResponse = {
  jobId: string;
  status: string;
  state: string;
  completedAt: string | null;
  failedAt: string | null;
  pdfReady: boolean;
  downloadUrl: string | null;
  error: string | null;
};

export function DocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const recentActions = useRecentItemsActions();
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTagIds, setEditTagIds] = useState<string[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [createTagOpened, { open: openCreateTag, close: closeCreateTag }] = useDisclosure(false);
  const [manageTagsOpened, { open: openManageTags, close: closeManageTags }] = useDisclosure(false);
  const [newTagName, setNewTagName] = useState('');
  const [createTagLoading, setCreateTagLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [editInitialSnapshot, setEditInitialSnapshot] = useState<{
    title: string;
    description: string;
    tagIds: string[];
  } | null>(null);
  const [assignContextOpened, { open: openAssignContext, close: closeAssignContext }] =
    useDisclosure(false);
  const [assignContextId, setAssignContextId] = useState<string | null>(null);
  const [assignContextLoading, setAssignContextLoading] = useState(false);
  const [pdfExportLoading, setPdfExportLoading] = useState(false);
  const [pdfExportJobId, setPdfExportJobId] = useState<string | null>(null);
  const [lastPdfExportStatus, setLastPdfExportStatus] = useState<string | null>(null);
  const [isTabVisible, setIsTabVisible] = useState<boolean>(
    () => document.visibilityState === 'visible'
  );
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
    refetchInterval: isTabVisible ? 15_000 : false,
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

  type ContextOption = { id: string; contextId: string; name: string; kind: 'process' | 'project' };
  const { data: assignContextsData } = useQuery({
    queryKey: ['processes', 'projects', 'ownerUserId=me', 'for-assign'],
    queryFn: async () => {
      const [procRes, projRes] = await Promise.all([
        apiFetch('/api/v1/processes?limit=100&offset=0&ownerUserId=me'),
        apiFetch('/api/v1/projects?limit=100&offset=0&ownerUserId=me'),
      ]);
      const processes = procRes.ok
        ? ((await procRes.json()) as { items: { id: string; contextId: string; name: string }[] })
            .items
        : [];
      const projects = projRes.ok
        ? ((await projRes.json()) as { items: { id: string; contextId: string; name: string }[] })
            .items
        : [];
      const options: ContextOption[] = [
        ...processes.map((p) => ({
          id: p.id,
          contextId: p.contextId,
          name: p.name,
          kind: 'process' as const,
        })),
        ...projects.map((p) => ({
          id: p.id,
          contextId: p.contextId,
          name: p.name,
          kind: 'project' as const,
        })),
      ];
      return options;
    },
    enabled: assignContextOpened && !!documentId,
  });
  const assignContextOptions = (assignContextsData ?? []).map((c) => ({
    value: c.contextId,
    label: `${c.kind === 'process' ? 'Process' : 'Project'}: ${c.name}`,
  }));

  const { data: pdfExportStatus } = useQuery<PdfExportJobStatusResponse>({
    queryKey: ['document-export-pdf-status', documentId, pdfExportJobId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/documents/${documentId}/export-pdf/${pdfExportJobId}`);
      if (!res.ok) throw new Error('Failed to load PDF export status');
      return res.json() as Promise<PdfExportJobStatusResponse>;
    },
    enabled: !!documentId && !!pdfExportJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'queued' || status === 'running') {
        return isTabVisible ? 5000 : 30_000;
      }
      return false;
    },
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (data) {
      setEditTitle(data.title);
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
    const onVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsTabVisible(visible);
      if (visible && documentId && pdfExportJobId) {
        void queryClient.invalidateQueries({
          queryKey: ['document-export-pdf-status', documentId, pdfExportJobId],
        });
      }
      if (visible && documentId) {
        void queryClient.invalidateQueries({ queryKey: ['document', documentId, 'lead-draft'] });
        void queryClient.invalidateQueries({ queryKey: ['document', documentId, 'suggestions'] });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [documentId, pdfExportJobId, queryClient]);

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

  useEffect(() => {
    if (!pdfExportStatus || pdfExportStatus.status === lastPdfExportStatus) return;
    setLastPdfExportStatus(pdfExportStatus.status);

    if (pdfExportStatus.status === 'running') {
      notifications.show({
        title: 'PDF export started',
        message: 'Your document export is running in the background.',
        color: 'blue',
      });
      return;
    }
    if (pdfExportStatus.status === 'succeeded') {
      void queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      notifications.show({
        title: 'PDF export ready',
        message: 'The PDF export finished successfully.',
        color: 'green',
      });
      return;
    }
    if (pdfExportStatus.status === 'failed') {
      notifications.show({
        title: 'PDF export failed',
        message: pdfExportStatus.error ?? 'Export could not be completed.',
        color: 'red',
      });
      return;
    }
    if (pdfExportStatus.status === 'cancelled') {
      notifications.show({
        title: 'PDF export cancelled',
        message: 'The PDF export was cancelled.',
        color: 'yellow',
      });
    }
  }, [pdfExportStatus, lastPdfExportStatus, queryClient, documentId]);

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
        if (data?.contextId)
          void queryClient.invalidateQueries({
            queryKey: ['contexts', data.contextId, 'documents'],
          });
        void queryClient.invalidateQueries({ queryKey: ['me', 'trash'] });
        closeDelete();
        notifications.show({
          title: 'Moved to trash',
          message: 'Document can be restored from the Trash tab.',
          color: 'green',
        });
        const scope = data?.scope;
        const target = scope != null ? scopeToUrl(scope) : '/catalog';
        void navigate(target, { replace: true });
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

  const handleArchive = async () => {
    if (!documentId) return;
    const res = await apiFetch(`/api/v1/documents/${documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivedAt: new Date().toISOString() }),
    });
    if (res.ok) {
      void queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'archive'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
      if (data?.contextId)
        void queryClient.invalidateQueries({
          queryKey: ['contexts', data.contextId, 'documents'],
        });
      notifications.show({
        title: 'Archived',
        message: 'Document was archived.',
        color: 'green',
      });
      const scope = data?.scope;
      const target = scope != null ? scopeToUrl(scope) : '/catalog';
      void navigate(target, { replace: true });
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      notifications.show({
        title: 'Error',
        message: body?.error ?? res.statusText,
        color: 'red',
      });
    }
  };

  const handleUnarchive = async () => {
    if (!documentId) return;
    const res = await apiFetch(`/api/v1/documents/${documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivedAt: null }),
    });
    if (res.ok) {
      void queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'archive'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
      if (data?.contextId)
        void queryClient.invalidateQueries({
          queryKey: ['contexts', data.contextId, 'documents'],
        });
      notifications.show({
        title: 'Unarchived',
        message: 'Document was restored to active.',
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
  };

  const handleSave = async () => {
    if (!documentId || !data) return;
    setSaveLoading(true);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim() || data.title,
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
        if (data.contextId)
          void queryClient.invalidateQueries({
            queryKey: ['contexts', data.contextId, 'documents'],
          });
        setMode('view');
        setEditInitialSnapshot(null);
        notifications.show({
          title: 'Gespeichert',
          message: 'Metadaten wurden aktualisiert.',
          color: 'green',
        });
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        notifications.show({
          title: 'Fehler',
          message: body?.error ?? res.statusText,
          color: 'red',
        });
      }
    } finally {
      setSaveLoading(false);
    }
  };

  const handleEditClick = () => {
    if (!data) return;
    setEditInitialSnapshot({
      title: data.title,
      description: data.description ?? '',
      tagIds: data.documentTags.map((dt) => dt.tag.id),
    });
    setMode('edit');
  };

  const handleCancelEdit = () => {
    const dirty =
      editInitialSnapshot != null &&
      (editTitle !== editInitialSnapshot.title ||
        editDescription !== editInitialSnapshot.description ||
        editTagIds.join(',') !== editInitialSnapshot.tagIds.join(','));
    if (dirty) {
      const ok = window.confirm(
        'Nicht gespeicherter Fortschritt kann verloren gehen. Wirklich abbrechen?'
      );
      if (!ok) return;
    }
    setMode('view');
    setEditInitialSnapshot(null);
  };

  const handlePublish = async () => {
    if (!documentId) return;
    setPublishLoading(true);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}/publish`, {
        method: 'POST',
      });
      if (res.ok) {
        void queryClient.invalidateQueries({ queryKey: ['document', documentId] });
        void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
        void queryClient.invalidateQueries({ queryKey: ['contexts'] });
        if (data?.contextId)
          void queryClient.invalidateQueries({
            queryKey: ['contexts', data.contextId, 'documents'],
          });
        void queryClient.invalidateQueries({ queryKey: ['me', 'drafts'] });
        void queryClient.invalidateQueries({ queryKey: [...meQueryKey, 'personal-documents'] });
        notifications.show({
          title: 'Published',
          message: 'Document was published.',
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
      setPublishLoading(false);
    }
  };

  const handleAssignContext = async () => {
    if (!documentId || !assignContextId) return;
    setAssignContextLoading(true);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextId: assignContextId }),
      });
      if (res.ok) {
        closeAssignContext();
        if (data?.contextId)
          void queryClient.invalidateQueries({
            queryKey: ['contexts', data.contextId, 'documents'],
          });
        if (assignContextId)
          void queryClient.invalidateQueries({
            queryKey: ['contexts', assignContextId, 'documents'],
          });
        setAssignContextId(null);
        void queryClient.invalidateQueries({ queryKey: ['document', documentId] });
        void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
        void queryClient.invalidateQueries({ queryKey: ['me', 'drafts'] });
        notifications.show({
          title: 'Context assigned',
          message: 'You can now publish the draft.',
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
      setAssignContextLoading(false);
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

  const handleStartPdfExport = async () => {
    if (!documentId) return;
    setPdfExportLoading(true);
    try {
      const res = await apiFetch(`/api/v1/documents/${documentId}/export-pdf`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 503) {
          notifications.show({
            title: 'PDF export currently delayed',
            message:
              body?.error ?? 'Queue/worker is currently unavailable. Please try again shortly.',
            color: 'yellow',
          });
          return;
        }
        notifications.show({
          title: 'PDF export could not be started',
          message: body?.error ?? res.statusText,
          color: 'red',
        });
        return;
      }
      const body = (await res.json()) as { jobId: string; status: string };
      setPdfExportJobId(body.jobId);
      setLastPdfExportStatus(null);
      notifications.show({
        title: 'PDF export queued',
        message: 'The export was queued and will run in the background.',
        color: 'blue',
      });
    } finally {
      setPdfExportLoading(false);
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
  const hasNoContext = data.contextId == null;
  const writerNames = [
    ...(data.writers?.users?.map((u) => u.name) ?? []),
    ...(data.writers?.teams?.map((t) => t.name) ?? []),
    ...(data.writers?.departments?.map((d) => d.name) ?? []),
  ].filter(Boolean);

  const publishedPlainFromBlocks =
    data.publishedBlocks != null ? blockDocumentToPlainPreview(data.publishedBlocks).trim() : '';

  const metadataItems: ReactNode[] = [];
  if (data.publishedAt) {
    const versionSuffix =
      data.currentPublishedVersionNumber != null ? ` · v${data.currentPublishedVersionNumber}` : '';
    metadataItems.push(
      <Group key="status" gap="xs" align="center">
        <Badge size="sm" variant="light" color="green">
          Published{versionSuffix}
        </Badge>
        <Text size="sm" c="dimmed" span>
          {new Date(data.publishedAt).toLocaleDateString(undefined)}
        </Text>
      </Group>
    );
  } else {
    metadataItems.push(
      <Badge key="status" size="sm" variant="light" color="yellow">
        Draft
      </Badge>
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
    data.documentTags.forEach((dt) => {
      metadataItems.push(
        <Badge key={`tag-${dt.tag.id}`} size="sm" variant="light" color="gray">
          {dt.tag.name}
        </Badge>
      );
    });
  }

  return (
    <>
      <Container fluid maw={1600} px="md" mb="xl">
        <Stack gap="lg" mb="xl" mt="md">
          {documentId != null && (
            <DocumentDocBreadcrumbs documentId={documentId} doc={data} historyMode="link" />
          )}
          <PageHeader
            title={docTitle}
            titleOrder={1}
            noBottomMargin
            titleIcon={
              data?.publishedAt ? (
                <IconFileText size={32} stroke={1.5} color="var(--mantine-color-dimmed)" />
              ) : (
                <IconPencil size={32} stroke={1.5} color="var(--mantine-color-dimmed)" />
              )
            }
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
                    <Button variant="default" size="sm" onClick={handleCancelEdit}>
                      Cancel
                    </Button>
                    <Button size="sm" loading={saveLoading} onClick={() => void handleSave()}>
                      Save
                    </Button>
                  </>
                )}
                {data.canWrite && mode === 'view' && (
                  <ActionIcon
                    variant="light"
                    size="36"
                    aria-label="Edit document"
                    onClick={handleEditClick}
                  >
                    <IconPencil size={18} />
                  </ActionIcon>
                )}
                {mode === 'edit' && data.canPublish && !data.publishedAt && (
                  <Button
                    variant="light"
                    size="sm"
                    color="green"
                    leftSection={<IconCloudUpload size={14} />}
                    loading={publishLoading}
                    onClick={() => void handlePublish()}
                  >
                    Publish
                  </Button>
                )}
                <Menu shadow="md" position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="default" size="36" aria-label="More actions">
                      <IconDotsVertical size={18} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      component={Link}
                      to={`/documents/${documentId}/versions`}
                      leftSection={<IconHistory size={14} />}
                    >
                      History
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconDownload size={14} />}
                      disabled={pdfExportLoading}
                      onClick={() => void handleStartPdfExport()}
                    >
                      {pdfExportLoading ? 'Queuing PDF export...' : 'Export PDF (async)'}
                    </Menu.Item>
                    {pdfExportStatus?.status === 'succeeded' && pdfExportStatus.downloadUrl && (
                      <Menu.Item
                        component="a"
                        href={pdfExportStatus.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        leftSection={<IconDownload size={14} />}
                      >
                        Download exported PDF
                      </Menu.Item>
                    )}
                    {hasNoContext && data.canWrite && (
                      <Menu.Item leftSection={<IconTarget size={14} />} onClick={openAssignContext}>
                        Assign to context
                      </Menu.Item>
                    )}
                    {data.canWrite && !data.archivedAt && (
                      <Menu.Item
                        leftSection={<IconArchive size={14} />}
                        onClick={() => void handleArchive()}
                      >
                        Archive
                      </Menu.Item>
                    )}
                    {data.canWrite && data.archivedAt && (
                      <Menu.Item
                        leftSection={<IconArchiveOff size={14} />}
                        onClick={() => void handleUnarchive()}
                      >
                        Unarchive
                      </Menu.Item>
                    )}
                    {data.canDelete && <Menu.Divider />}
                    {data.canDelete && (
                      <Menu.Item
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={openDelete}
                      >
                        Move to trash
                      </Menu.Item>
                    )}
                  </Menu.Dropdown>
                </Menu>
              </Group>
            }
          />
        </Stack>

        <Paper withBorder={false} p="lg" radius="md">
          <Flex
            direction={{ base: 'column', lg: 'row' }}
            gap={{ base: 'xl', lg: 48 }}
            align="flex-start"
          >
            {mode === 'view' && headings.length > 0 && (
              <Box
                w={{ base: '100%', lg: 280 }}
                style={{ flexShrink: 0, position: 'sticky', top: 'var(--mantine-spacing-xl)' }}
              >
                <Text
                  tt="uppercase"
                  fz="xs"
                  fw={600}
                  c="dimmed"
                  mb="sm"
                  style={{ paddingLeft: 'var(--mantine-spacing-xs)', letterSpacing: 1 }}
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
            )}

            <Box style={{ flex: 1, minWidth: 0, width: '100%' }}>
              <Flex
                gap={{ base: 'lg', lg: 'xl' }}
                direction={{ base: 'column', lg: 'row' }}
                align="flex-start"
                wrap="nowrap"
                w="100%"
                style={{ minHeight: 0 }}
              >
                <Stack gap="lg" style={{ flex: 1, minWidth: 0 }}>
                  {mode === 'view' ? (
                    <Card withBorder padding="lg" style={{ maxWidth: '75ch' }}>
                      <Box
                        className="document-content"
                        style={{
                          paddingBottom: 'var(--mantine-spacing-xl)',
                          maxWidth: '100%',
                          marginLeft: 0,
                        }}
                      >
                        {(() => {
                          slugCountsRef.current = {};
                          return null;
                        })()}
                        {data.publishedBlocks != null ? (
                          publishedPlainFromBlocks ? (
                            <DocumentBlocksPreview title="Inhalt" doc={data.publishedBlocks} />
                          ) : (
                            <Text size="sm" c="dimmed">
                              Veröffentlichte Version liefert Blocks ohne extrahierbaren Text. Zum
                              Pflegen des Lead-Drafts den Bearbeiten-Modus öffnen.
                            </Text>
                          )
                        ) : (
                          <Typography>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={markdownHeadingComponents}
                            >
                              {data.content || ''}
                            </ReactMarkdown>
                          </Typography>
                        )}
                      </Box>
                    </Card>
                  ) : (
                    <Card withBorder padding="lg">
                      <Stack gap="md">
                        <Alert variant="light" color="blue" title="Inhalt bearbeiten">
                          <Text size="sm">
                            Fließtext und Struktur werden im Block-System unten über Lead-Draft und
                            Suggestions gepflegt. Hier nur Titel, Beschreibung und Tags.
                          </Text>
                        </Alert>
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
                    </Card>
                  )}
                </Stack>

                {documentId != null && data != null && (
                  <Box
                    component="aside"
                    aria-label="Comments"
                    w={{ base: '100%', lg: 'auto' }}
                    style={{ flexShrink: 0, alignSelf: 'stretch' }}
                  >
                    <DocumentCommentsSection
                      documentId={documentId}
                      currentUserId={me?.user?.id}
                      headings={headings.map(({ id, text }) => ({ id, text }))}
                      layout="rail"
                    />
                  </Box>
                )}
              </Flex>
            </Box>
          </Flex>

          {mode === 'edit' && (data.canWrite || data.canPublish) && documentId != null && (
            <Card withBorder padding="lg" mt="xl" maw={1200}>
              <Text fw={600} size="sm" mb="md">
                Block-System (Lead-Draft & Suggestions)
              </Text>
              <Tabs defaultValue="lead">
                <Tabs.List>
                  <Tabs.Tab value="lead">Lead-Draft (API)</Tabs.Tab>
                  <Tabs.Tab value="suggestions">Suggestions</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="lead" pt="md">
                  <DocumentLeadDraftPanel
                    documentId={documentId}
                    refetchWhenVisible={isTabVisible}
                  />
                </Tabs.Panel>
                <Tabs.Panel value="suggestions" pt="md">
                  <DocumentSuggestionsPanel
                    documentId={documentId}
                    currentUserId={me?.user?.id}
                    canPublish={!!data.canPublish}
                    refetchWhenVisible={isTabVisible}
                  />
                </Tabs.Panel>
              </Tabs>
            </Card>
          )}
        </Paper>
      </Container>

      <Modal opened={deleteOpened} onClose={closeDelete} title="Move to trash" centered>
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
            Move to trash
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={assignContextOpened}
        onClose={() => {
          closeAssignContext();
          setAssignContextId(null);
        }}
        title="Assign to context"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Choose a process or project to assign this draft to. You can then publish it.
          </Text>
          <Select
            label="Context"
            placeholder="Select process or project"
            data={assignContextOptions}
            value={assignContextId}
            onChange={(v) => setAssignContextId(v)}
            searchable
          />
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              onClick={() => {
                closeAssignContext();
                setAssignContextId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!assignContextId}
              loading={assignContextLoading}
              onClick={() => void handleAssignContext()}
            >
              Assign
            </Button>
          </Group>
        </Stack>
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
