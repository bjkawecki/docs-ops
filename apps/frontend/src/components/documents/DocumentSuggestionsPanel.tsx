import {
  Alert,
  Box,
  Button,
  Group,
  NumberInput,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';
import type { DocumentSuggestionItem } from '../../api/document-types';

const POLL_MS = 15_000;

type SuggestionsQueryResult = DocumentSuggestionItem[] | { forbidden: true };

type Props = {
  documentId: string;
  currentUserId: string | undefined;
  canPublish: boolean;
  refetchWhenVisible: boolean;
};

export function DocumentSuggestionsPanel({
  documentId,
  currentUserId,
  canPublish,
  refetchWhenVisible,
}: Props) {
  const queryClient = useQueryClient();
  const [baseRev, setBaseRev] = useState<number | string>(0);
  const [opsJson, setOpsJson] = useState(
    '[\n  { "op": "deleteBlock", "blockId": "BLOCK_ID_HIER" }\n]\n'
  );
  const [opsError, setOpsError] = useState<string | null>(null);

  const q = useQuery<SuggestionsQueryResult>({
    queryKey: ['document', documentId, 'suggestions'],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/documents/${documentId}/suggestions`);
      if (res.status === 403) return { forbidden: true as const };
      if (!res.ok) throw new Error('suggestions');
      return res.json() as Promise<DocumentSuggestionItem[]>;
    },
    enabled: !!documentId,
    refetchInterval: refetchWhenVisible ? POLL_MS : false,
  });

  const ld = useQuery({
    queryKey: ['document', documentId, 'lead-draft'],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/documents/${documentId}/lead-draft`);
      if (!res.ok) return null;
      return res.json() as Promise<{ draftRevision: number }>;
    },
    enabled: !!documentId && !canPublish,
    refetchInterval: refetchWhenVisible ? POLL_MS : false,
  });

  const syncBaseFromLead = useCallback(() => {
    const r = ld.data?.draftRevision;
    if (typeof r === 'number') setBaseRev(r);
  }, [ld.data?.draftRevision]);

  const submitSuggestion = useCallback(async () => {
    let ops: unknown;
    try {
      ops = JSON.parse(opsJson) as unknown;
    } catch {
      setOpsError('Ungültiges JSON (Ops-Array)');
      return;
    }
    setOpsError(null);
    const rev = typeof baseRev === 'string' ? Number.parseInt(baseRev, 10) : baseRev;
    if (!Number.isFinite(rev) || rev < 0) {
      setOpsError('baseDraftRevision ungültig');
      return;
    }
    const res = await apiFetch(`/api/v1/documents/${documentId}/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseDraftRevision: rev, ops }),
    });
    if (res.status === 409) {
      notifications.show({
        color: 'yellow',
        title: 'Veraltet',
        message: 'Revision passt nicht – Lead-Draft neu laden und baseDraftRevision anpassen.',
      });
      await ld.refetch();
      await q.refetch();
      return;
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: unknown };
      const msg = typeof err.error === 'string' ? err.error : res.statusText;
      notifications.show({
        color: 'red',
        title: 'Vorschlag konnte nicht eingereicht werden',
        message: msg,
      });
      return;
    }
    notifications.show({ color: 'green', message: 'Vorschlag eingereicht.' });
    await queryClient.invalidateQueries({ queryKey: ['document', documentId, 'suggestions'] });
    await q.refetch();
  }, [baseRev, documentId, ld, opsJson, q, queryClient]);

  const withdraw = useCallback(
    async (suggestionId: string) => {
      const res = await apiFetch(
        `/api/v1/documents/${documentId}/suggestions/${suggestionId}/withdraw`,
        { method: 'POST' }
      );
      if (!res.ok) {
        notifications.show({ color: 'red', message: 'Zurückziehen fehlgeschlagen.' });
        return;
      }
      notifications.show({ color: 'green', message: 'Vorschlag zurückgezogen.' });
      await q.refetch();
    },
    [documentId, q]
  );

  const accept = useCallback(
    async (suggestionId: string) => {
      const res = await apiFetch(
        `/api/v1/documents/${documentId}/suggestions/${suggestionId}/accept`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      );
      if (res.status === 409) {
        notifications.show({
          color: 'yellow',
          message: 'Vorschlag oder Draft veraltet (409).',
        });
        await q.refetch();
        await queryClient.invalidateQueries({ queryKey: ['document', documentId, 'lead-draft'] });
        return;
      }
      if (!res.ok) {
        notifications.show({ color: 'red', message: 'Annehmen fehlgeschlagen.' });
        return;
      }
      notifications.show({ color: 'green', message: 'Vorschlag angenommen, Draft aktualisiert.' });
      await queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      await queryClient.invalidateQueries({ queryKey: ['document', documentId, 'lead-draft'] });
      await queryClient.invalidateQueries({ queryKey: ['document', documentId, 'suggestions'] });
      await q.refetch();
    },
    [documentId, q, queryClient]
  );

  const reject = useCallback(
    async (suggestionId: string) => {
      const res = await apiFetch(
        `/api/v1/documents/${documentId}/suggestions/${suggestionId}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment: 'Abgelehnt (UI)' }),
        }
      );
      if (!res.ok) {
        notifications.show({ color: 'red', message: 'Ablehnen fehlgeschlagen.' });
        return;
      }
      notifications.show({ color: 'green', message: 'Vorschlag abgelehnt.' });
      await q.refetch();
    },
    [documentId, q]
  );

  if (q.isPending) {
    return (
      <Text size="sm" c="dimmed">
        Suggestions werden geladen…
      </Text>
    );
  }
  if (q.isError) {
    return (
      <Alert color="red" title="Fehler">
        Suggestions konnten nicht geladen werden.
      </Alert>
    );
  }
  if (q.data && !Array.isArray(q.data)) {
    return (
      <Text size="sm" c="dimmed">
        Kein Zugriff auf die Suggestions-Liste.
      </Text>
    );
  }

  const rows = Array.isArray(q.data) ? q.data : [];

  return (
    <Stack gap="md">
      {!canPublish && (
        <Box>
          <Text size="sm" fw={600} mb="xs">
            Neuen Vorschlag einreichen (JSON-Ops)
          </Text>
          <Group align="flex-end" wrap="wrap" mb="xs">
            <NumberInput
              label="baseDraftRevision"
              value={baseRev}
              onChange={setBaseRev}
              min={0}
              w={160}
            />
            <Button variant="light" size="xs" onClick={() => syncBaseFromLead()}>
              Aus Lead-Draft übernehmen
            </Button>
          </Group>
          <Textarea
            label="Ops (JSON-Array)"
            value={opsJson}
            onChange={(e) => setOpsJson(e.currentTarget.value)}
            minRows={6}
            error={opsError}
            styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
          />
          <Button size="sm" mt="xs" onClick={() => void submitSuggestion()}>
            Vorschlag senden
          </Button>
        </Box>
      )}

      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Status</Table.Th>
            <Table.Th>Autor</Table.Th>
            <Table.Th>Rev.</Table.Th>
            <Table.Th>Aktion</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text size="sm" c="dimmed">
                  Keine Suggestions.
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            rows.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td>{s.status}</Table.Td>
                <Table.Td>{s.authorName ?? s.authorId}</Table.Td>
                <Table.Td>{s.baseDraftRevision}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    {s.status === 'pending' && currentUserId === s.authorId && !canPublish && (
                      <Button size="compact-xs" variant="light" onClick={() => void withdraw(s.id)}>
                        Zurückziehen
                      </Button>
                    )}
                    {s.status === 'pending' && canPublish && (
                      <>
                        <Button
                          size="compact-xs"
                          color="green"
                          variant="light"
                          onClick={() => void accept(s.id)}
                        >
                          Annehmen
                        </Button>
                        <Button
                          size="compact-xs"
                          color="red"
                          variant="light"
                          onClick={() => void reject(s.id)}
                        >
                          Ablehnen
                        </Button>
                      </>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
