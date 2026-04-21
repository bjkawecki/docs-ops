import { Alert, Box, Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';
import type { BlockDocumentV0, LeadDraftResponse } from '../../api/document-types';

const POLL_MS = 15_000;

type Props = {
  documentId: string;
  /** Tab sichtbar → periodisches Nachladen (EPIC-8c). */
  refetchWhenVisible: boolean;
};

export function DocumentLeadDraftPanel({ documentId, refetchWhenVisible }: Props) {
  const queryClient = useQueryClient();
  const [draftJson, setDraftJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['document', documentId, 'lead-draft'],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/documents/${documentId}/lead-draft`);
      if (res.status === 403) return { forbidden: true as const };
      if (res.status === 404) throw new Error('not-found');
      if (!res.ok) throw new Error('lead-draft');
      return res.json() as Promise<LeadDraftResponse>;
    },
    enabled: !!documentId,
    refetchInterval: refetchWhenVisible ? POLL_MS : false,
  });

  const data = q.data;
  const canEdit = data && !('forbidden' in data) && data.canEdit;
  const revision = data && !('forbidden' in data) ? data.draftRevision : 0;

  useEffect(() => {
    if (!data || 'forbidden' in data) return;
    setDraftJson(JSON.stringify(data.blocks ?? { schemaVersion: 0, blocks: [] }, null, 2));
    setJsonError(null);
  }, [data]);

  const handleSave = useCallback(async () => {
    if (!data || 'forbidden' in data || !canEdit) return;
    let parsed: BlockDocumentV0;
    try {
      parsed = JSON.parse(draftJson) as BlockDocumentV0;
    } catch {
      setJsonError('Ungültiges JSON');
      return;
    }
    if (parsed.schemaVersion !== 0 || !Array.isArray(parsed.blocks)) {
      setJsonError('Erwartet schemaVersion: 0 und blocks: Array');
      return;
    }
    setJsonError(null);
    const res = await apiFetch(`/api/v1/documents/${documentId}/lead-draft`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: revision,
        blocks: parsed,
      }),
    });
    if (res.status === 409) {
      notifications.show({
        color: 'yellow',
        title: 'Konflikt',
        message: 'Lead-Draft wurde zwischenzeitlich geändert. Bitte neu laden.',
      });
      await q.refetch();
      return;
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: unknown };
      const msg = typeof err.error === 'string' ? err.error : res.statusText;
      notifications.show({
        color: 'red',
        title: 'Speichern fehlgeschlagen',
        message: msg,
      });
      return;
    }
    notifications.show({ color: 'green', message: 'Lead-Draft gespeichert.' });
    await queryClient.invalidateQueries({ queryKey: ['document', documentId] });
    await queryClient.invalidateQueries({ queryKey: ['document', documentId, 'lead-draft'] });
    await queryClient.invalidateQueries({ queryKey: ['document', documentId, 'suggestions'] });
    await q.refetch();
  }, [canEdit, data, documentId, draftJson, queryClient, q, revision]);

  if (q.isPending) {
    return (
      <Text size="sm" c="dimmed">
        Lead-Draft wird geladen…
      </Text>
    );
  }
  if (q.isError) {
    return (
      <Alert color="red" title="Fehler">
        Lead-Draft konnte nicht geladen werden.
      </Alert>
    );
  }
  if (data && 'forbidden' in data) {
    return (
      <Text size="sm" c="dimmed">
        Kein Zugriff auf den gemeinsamen Lead-Draft (nur für Bearbeitende mit Schreib- oder
        Lead-Recht).
      </Text>
    );
  }

  return (
    <Stack gap="sm">
      <Group gap="md">
        <Text size="sm">
          <strong>Revision:</strong> {revision}
        </Text>
        <Text size="sm" c={canEdit ? 'teal' : 'dimmed'}>
          {canEdit ? 'Sie können den Lead-Draft bearbeiten.' : 'Nur Lesen (kein Lead-Draft-PATCH).'}
        </Text>
      </Group>
      <Textarea
        label="Block-JSON (v0)"
        value={draftJson}
        onChange={(e) => setDraftJson(e.currentTarget.value)}
        readOnly={!canEdit}
        minRows={12}
        autosize
        maxRows={28}
        styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12 } }}
        error={jsonError}
      />
      {canEdit && (
        <Box>
          <Button size="sm" onClick={() => void handleSave()}>
            Lead-Draft speichern
          </Button>
        </Box>
      )}
    </Stack>
  );
}
