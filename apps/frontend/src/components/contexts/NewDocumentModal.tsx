import {
  Button,
  Group,
  Modal,
  MultiSelect,
  Radio,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api/client';
import { notifications } from '@mantine/notifications';
import type { NewContextScope } from './NewContextModal';

export interface NewDocumentModalProps {
  opened: boolean;
  onClose: () => void;
  scope: NewContextScope;
  onSuccess?: () => void;
  /** When true (e.g. on Personal page), allow creating a draft without context (ungrouped). */
  allowNoContext?: boolean;
}

type ProcessItem = { id: string; name: string; contextId: string };
type ProjectItem = { id: string; name: string; contextId: string };

function buildProcessParams(scope: NewContextScope): string {
  const base = 'limit=100&offset=0';
  if (scope.type === 'personal') return `${base}&ownerUserId=me`;
  if (scope.type === 'company') return `${base}&companyId=${scope.companyId}`;
  if (scope.type === 'department') return `${base}&departmentId=${scope.departmentId}`;
  return `${base}&teamId=${scope.teamId}`;
}

function buildProjectParams(scope: NewContextScope): string {
  const base = 'limit=100&offset=0';
  if (scope.type === 'personal') return `${base}&ownerUserId=me`;
  if (scope.type === 'company') return `${base}&companyId=${scope.companyId}`;
  if (scope.type === 'department') return `${base}&departmentId=${scope.departmentId}`;
  return `${base}&teamId=${scope.teamId}`;
}

type DraftMode = 'in_context' | 'no_context';

export function NewDocumentModal({
  opened,
  onClose,
  scope,
  onSuccess,
  allowNoContext = false,
}: NewDocumentModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<DraftMode>('in_context');
  const [contextId, setContextId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const processParams = buildProcessParams(scope);
  const projectParams = buildProjectParams(scope);

  const { data: processesData } = useQuery({
    queryKey: ['processes', 'for-document', processParams],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/processes?${processParams}`);
      if (!res.ok) throw new Error('Failed to load processes');
      const data = (await res.json()) as { items: ProcessItem[] };
      return data.items;
    },
    enabled: opened,
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects', 'for-document', projectParams],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/projects?${projectParams}`);
      if (!res.ok) throw new Error('Failed to load projects');
      const data = (await res.json()) as { items: ProjectItem[] };
      return data.items;
    },
    enabled: opened,
  });

  const { data: tagsData } = useQuery({
    queryKey: ['tags', contextId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/tags?contextId=${contextId}`);
      if (!res.ok) throw new Error('Failed to load tags');
      return res.json() as Promise<{ id: string; name: string }[]>;
    },
    enabled: opened && !!contextId,
  });

  const processes = processesData ?? [];
  const projects = projectsData ?? [];
  const tags = tagsData ?? [];
  const contextOptions = [
    ...processes.map((p) => ({ value: p.contextId, label: `Process: ${p.name}` })),
    ...projects.map((p) => ({ value: p.contextId, label: `Project: ${p.name}` })),
  ];
  const tagOptions = tags.map((t) => ({ value: t.id, label: t.name }));

  const reset = () => {
    setMode('in_context');
    setContextId(null);
    setTitle('');
    setContent('');
    setTagIds([]);
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const noContext = allowNoContext && mode === 'no_context';
  const canSubmit = noContext
    ? title.trim().length > 0
    : contextId != null && title.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (!noContext && !contextId) return;
    setLoading(true);
    try {
      const body = noContext
        ? { title: title.trim(), content }
        : { title: title.trim(), content, contextId: contextId!, tagIds };
      const res = await apiFetch('/api/v1/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 201) {
        const doc = (await res.json()) as { id: string };
        if (contextId) {
          void queryClient.invalidateQueries({ queryKey: ['contexts', contextId, 'documents'] });
        }
        void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
        void queryClient.invalidateQueries({ queryKey: ['me', 'personal-documents'] });
        void queryClient.invalidateQueries({ queryKey: ['me', 'drafts'] });
        onSuccess?.();
        handleClose();
        notifications.show({
          title: 'Draft created',
          message: 'Redirecting to draft.',
          color: 'green',
        });
        void navigate(`/documents/${doc.id}`);
      } else {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        notifications.show({
          title: 'Error',
          message: errBody?.error ?? res.statusText,
          color: 'red',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="New draft" size="sm">
      <Stack gap="md">
        {allowNoContext && (
          <Radio.Group
            label="Create draft"
            value={mode}
            onChange={(v) => setMode(v as DraftMode)}
            description="Without context: draft stays ungrouped until you assign a context."
          >
            <Stack gap="xs" mt="xs">
              <Radio value="in_context" label="In a context (Process or Project)" />
              <Radio value="no_context" label="Without context (ungrouped draft)" />
            </Stack>
          </Radio.Group>
        )}
        {!noContext && (
          <>
            <Select
              label="Context (Process or Project)"
              placeholder="Select context"
              data={contextOptions}
              value={contextId}
              onChange={(v) => setContextId(v)}
              required
            />
            {contextOptions.length === 0 && (
              <Text size="sm" c="dimmed">
                No processes or projects in this scope. Create a process or project first.
              </Text>
            )}
          </>
        )}
        <TextInput
          label="Title"
          placeholder="Draft title"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          required
        />
        <Textarea
          label="Content (Markdown)"
          placeholder="Optional content"
          value={content}
          onChange={(e) => setContent(e.currentTarget.value)}
          minRows={4}
        />
        {!noContext && (
          <MultiSelect
            label="Tags"
            data={tagOptions}
            value={tagIds}
            onChange={setTagIds}
            placeholder="Select tags"
            searchable
            clearable
          />
        )}
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={handleClose}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} loading={loading} onClick={() => void handleSubmit()}>
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
