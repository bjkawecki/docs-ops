import { Accordion, Alert, Box, Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';
import type { BlockDocumentV0, LeadDraftResponse } from '../../api/document-types';
import { LeadDraftTiptapEditor, type LeadDraftTiptapEditorHandle } from './LeadDraftTiptapEditor';

const POLL_MS = 15_000;

const emptyDoc: BlockDocumentV0 = { schemaVersion: 0, blocks: [] };

type Props = {
  documentId: string;
  /** Tab sichtbar → periodisches Nachladen (EPIC-8c). */
  refetchWhenVisible: boolean;
};

export function DocumentLeadDraftPanel({ documentId, refetchWhenVisible }: Props) {
  const queryClient = useQueryClient();
  const editorRef = useRef<LeadDraftTiptapEditorHandle>(null);
  const [accordionRaw, setAccordionRaw] = useState<string | null>(null);
  const [rawJson, setRawJson] = useState('');

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

  const serverDoc = useMemo<BlockDocumentV0>(() => {
    if (!data || 'forbidden' in data) return emptyDoc;
    return data.blocks ?? { schemaVersion: 0, blocks: [] };
  }, [data]);

  const serverFingerprint = useMemo(() => JSON.stringify(serverDoc), [serverDoc]);

  useEffect(() => {
    if (accordionRaw !== 'raw') return;
    const doc = editorRef.current?.getBlockDocument() ?? serverDoc;
    setRawJson(JSON.stringify(doc, null, 2));
  }, [accordionRaw, serverFingerprint, serverDoc]);

  const handleSave = useCallback(async () => {
    if (!data || 'forbidden' in data) return;
    const parsed = editorRef.current?.getBlockDocument() ?? serverDoc;
    if (parsed.schemaVersion !== 0 || !Array.isArray(parsed.blocks)) {
      notifications.show({
        color: 'red',
        title: 'Ungültiges Dokument',
        message: 'Erwartet schemaVersion: 0 und blocks: Array',
      });
      return;
    }
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
  }, [data, documentId, queryClient, q, revision, serverDoc]);

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

      <LeadDraftTiptapEditor
        ref={editorRef}
        sourceDocument={serverDoc}
        contentFingerprint={serverFingerprint}
        editable={!!canEdit}
      />

      <Accordion
        variant="contained"
        chevronPosition="right"
        value={accordionRaw}
        onChange={(v) => setAccordionRaw(v)}
      >
        <Accordion.Item value="raw">
          <Accordion.Control>Roh-JSON (Fallback / Debugging)</Accordion.Control>
          <Accordion.Panel>
            <Textarea
              readOnly
              minRows={10}
              autosize
              maxRows={24}
              value={rawJson}
              styles={{
                input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 12 },
              }}
            />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

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
