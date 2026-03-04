import {
  Button,
  Group,
  Modal,
  MultiSelect,
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

export function NewDocumentModal({ opened, onClose, scope, onSuccess }: NewDocumentModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  const canSubmit = contextId != null && title.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || !contextId) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content,
          contextId,
          tagIds,
        }),
      });
      if (res.status === 201) {
        const doc = (await res.json()) as { id: string };
        void queryClient.invalidateQueries({ queryKey: ['contexts', contextId, 'documents'] });
        void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
        void queryClient.invalidateQueries({ queryKey: ['me', 'personal-documents'] });
        onSuccess?.();
        handleClose();
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
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="New document" size="sm">
      <Stack gap="md">
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
        <TextInput
          label="Title"
          placeholder="Document title"
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
        <MultiSelect
          label="Tags"
          data={tagOptions}
          value={tagIds}
          onChange={setTagIds}
          placeholder="Select tags"
          searchable
          clearable
        />
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
