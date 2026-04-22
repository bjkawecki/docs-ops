import {
  Alert,
  Box,
  Badge,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';
import type {
  BlockDocumentV0,
  BlockNodeV0,
  DocumentSuggestionItem,
} from '../../api/document-types';
import { innerTextFromBlockNode } from '../../lib/blockDocumentTiptap';

const POLL_MS = 15_000;

type SuggestionsQueryResult = DocumentSuggestionItem[] | { forbidden: true };

type Props = {
  documentId: string;
  currentUserId: string | undefined;
  canPublish: boolean;
  leadDraftBlocks: BlockDocumentV0 | null;
  refetchWhenVisible: boolean;
};

export type DocumentSuggestionsPanelHandle = {
  submitFromShortcut: () => Promise<boolean>;
};

function editableBlockLabel(block: BlockNodeV0): string {
  const text = innerTextFromBlockNode(block).trim();
  const base = text.length > 0 ? text.slice(0, 80) : block.type;
  return `${block.type.toUpperCase()} · ${base}`;
}

function buildReplacementBlock(source: BlockNodeV0, text: string): BlockNodeV0 {
  const leaf = {
    id: crypto.randomUUID(),
    type: 'text',
    attrs: {},
    meta: { text },
  } as const;
  return {
    ...source,
    content: [leaf],
  };
}

export const DocumentSuggestionsPanel = forwardRef<DocumentSuggestionsPanelHandle, Props>(
  function DocumentSuggestionsPanel(
    { documentId, currentUserId, canPublish, leadDraftBlocks, refetchWhenVisible }: Props,
    ref
  ) {
    const queryClient = useQueryClient();
    const [baseRev, setBaseRev] = useState<number | string>(0);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const [replacementText, setReplacementText] = useState('');
    const [formError, setFormError] = useState<string | null>(null);

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

    const blockOptions = useMemo(() => {
      const source = leadDraftBlocks?.blocks ?? [];
      return source
        .filter((b) => ['heading', 'paragraph', 'code'].includes(b.type))
        .map((b) => ({ value: b.id, label: editableBlockLabel(b) }));
    }, [leadDraftBlocks?.blocks]);

    const syncBaseFromLead = useCallback(() => {
      const r = ld.data?.draftRevision;
      if (typeof r === 'number') setBaseRev(r);
    }, [ld.data?.draftRevision]);

    const submitSuggestion = useCallback(async () => {
      const blockId = selectedBlockId;
      if (!blockId) {
        setFormError('Select a block.');
        return false;
      }
      const text = replacementText.trim();
      if (!text) {
        setFormError('Write your proposed replacement text.');
        return false;
      }
      const source = leadDraftBlocks?.blocks.find((b) => b.id === blockId);
      if (!source) {
        setFormError('Selected block no longer exists in the current draft.');
        return false;
      }
      setFormError(null);
      const rev = typeof baseRev === 'string' ? Number.parseInt(baseRev, 10) : baseRev;
      if (!Number.isFinite(rev) || rev < 0) {
        setFormError('Base draft revision is invalid.');
        return false;
      }
      const replacement = buildReplacementBlock(source, text);
      const ops = [{ op: 'replaceBlock', blockId, block: replacement }];
      const res = await apiFetch(`/api/v1/documents/${documentId}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseDraftRevision: rev, ops }),
      });
      if (res.status === 409) {
        notifications.show({
          color: 'yellow',
          title: 'Outdated revision',
          message: 'Draft revision changed. Refresh and try again.',
        });
        await ld.refetch();
        await q.refetch();
        return false;
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: unknown };
        const msg = typeof err.error === 'string' ? err.error : res.statusText;
        notifications.show({
          color: 'red',
          title: 'Submission failed',
          message: msg,
        });
        return false;
      }
      notifications.show({ color: 'green', message: 'Suggestion submitted.' });
      setReplacementText('');
      await queryClient.invalidateQueries({ queryKey: ['document', documentId, 'suggestions'] });
      await q.refetch();
      return true;
    }, [
      baseRev,
      documentId,
      ld,
      leadDraftBlocks?.blocks,
      q,
      queryClient,
      replacementText,
      selectedBlockId,
    ]);

    const withdraw = useCallback(
      async (suggestionId: string) => {
        const res = await apiFetch(
          `/api/v1/documents/${documentId}/suggestions/${suggestionId}/withdraw`,
          { method: 'POST' }
        );
        if (!res.ok) {
          notifications.show({ color: 'red', message: 'Could not withdraw suggestion.' });
          return;
        }
        notifications.show({ color: 'green', message: 'Suggestion withdrawn.' });
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
            message: 'Suggestion or draft is outdated (409).',
          });
          await q.refetch();
          await queryClient.invalidateQueries({ queryKey: ['document', documentId, 'lead-draft'] });
          return;
        }
        if (!res.ok) {
          notifications.show({ color: 'red', message: 'Could not accept suggestion.' });
          return;
        }
        notifications.show({ color: 'green', message: 'Suggestion accepted and draft updated.' });
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
            body: JSON.stringify({ comment: 'Rejected in UI' }),
          }
        );
        if (!res.ok) {
          notifications.show({ color: 'red', message: 'Could not reject suggestion.' });
          return;
        }
        notifications.show({ color: 'green', message: 'Suggestion rejected.' });
        await q.refetch();
      },
      [documentId, q]
    );

    useImperativeHandle(
      ref,
      () => ({
        submitFromShortcut: async () => submitSuggestion(),
      }),
      [submitSuggestion]
    );

    if (q.isPending) {
      return (
        <Text size="sm" c="dimmed">
          Loading suggestions...
        </Text>
      );
    }
    if (q.isError) {
      return (
        <Alert color="red" title="Error">
          Suggestions could not be loaded.
        </Alert>
      );
    }
    if (q.data && !Array.isArray(q.data)) {
      return (
        <Text size="sm" c="dimmed">
          No access to suggestions.
        </Text>
      );
    }

    const rows = Array.isArray(q.data) ? q.data : [];

    return (
      <Stack gap="md">
        {!canPublish && (
          <Box>
            <Text size="sm" fw={600} mb="xs">
              Propose a change
            </Text>
            <Group align="flex-end" wrap="wrap" mb="xs">
              <NumberInput
                label="Base revision"
                value={baseRev}
                onChange={setBaseRev}
                min={0}
                w={160}
              />
              <Button variant="light" size="xs" onClick={() => syncBaseFromLead()}>
                Use current draft revision
              </Button>
            </Group>
            <Select
              label="Block"
              data={blockOptions}
              value={selectedBlockId}
              onChange={setSelectedBlockId}
              searchable
              clearable
              placeholder="Select block to replace"
              mb="xs"
            />
            <Textarea
              label="Replacement text"
              value={replacementText}
              onChange={(e) => setReplacementText(e.currentTarget.value)}
              minRows={5}
              error={formError}
            />
            <Button size="sm" mt="xs" onClick={() => void submitSuggestion()}>
              Submit suggestion
            </Button>
          </Box>
        )}

        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Status</Table.Th>
              <Table.Th>Author</Table.Th>
              <Table.Th>Base rev</Table.Th>
              <Table.Th>Action</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text size="sm" c="dimmed">
                    No suggestions yet.
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              rows.map((s) => (
                <Table.Tr key={s.id}>
                  <Table.Td>
                    <Badge variant="light">{s.status}</Badge>
                  </Table.Td>
                  <Table.Td>{s.authorName ?? s.authorId}</Table.Td>
                  <Table.Td>{s.baseDraftRevision}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      {s.status === 'pending' && currentUserId === s.authorId && !canPublish && (
                        <Button
                          size="compact-xs"
                          variant="light"
                          onClick={() => void withdraw(s.id)}
                        >
                          Withdraw
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
                            Accept
                          </Button>
                          <Button
                            size="compact-xs"
                            color="red"
                            variant="light"
                            onClick={() => void reject(s.id)}
                          >
                            Reject
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
);

DocumentSuggestionsPanel.displayName = 'DocumentSuggestionsPanel';
