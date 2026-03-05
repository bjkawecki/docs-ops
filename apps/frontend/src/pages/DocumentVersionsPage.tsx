import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  NativeSelect,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import DiffMatchPatch from 'diff-match-patch';
import { useMemo, useState } from 'react';

type VersionItem = {
  id: string;
  versionNumber: number;
  createdAt: string;
  createdById: string | null;
  createdByName: string | null;
};

type VersionDetail = VersionItem & {
  content: string;
};

/** Operation: -1 delete, 0 equal, 1 insert (diff-match-patch). */
type DiffTuple = [number, string];

function DiffView({ fromContent, toContent }: { fromContent: string; toContent: string }) {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- diff-match-patch has no types */
  const dmp = useMemo(() => new DiffMatchPatch(), []);
  const diffs = useMemo((): DiffTuple[] => {
    const d = dmp.diff_main(fromContent, toContent) as DiffTuple[];
    dmp.diff_cleanupSemantic(d);
    return d;
  }, [dmp, fromContent, toContent]);
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

  return (
    <Box
      component="pre"
      style={{
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: 'var(--mantine-font-family-monospace)',
        fontSize: 'var(--mantine-font-size-sm)',
        padding: 'var(--mantine-spacing-md)',
        borderRadius: 'var(--mantine-radius-md)',
        backgroundColor: 'var(--mantine-color-dark-6)',
        overflow: 'auto',
      }}
    >
      {diffs.map(([op, text], i) => {
        if (op === 0) return <span key={i}>{text}</span>;
        if (op === -1)
          return (
            <span
              key={i}
              style={{
                backgroundColor: 'rgba(255, 0, 0, 0.35)',
                textDecoration: 'line-through',
              }}
            >
              {text}
            </span>
          );
        return (
          <span
            key={i}
            style={{
              backgroundColor: 'rgba(0, 200, 0, 0.35)',
            }}
          >
            {text}
          </span>
        );
      })}
    </Box>
  );
}

export function DocumentVersionsPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewVersionId = searchParams.get('version') ?? '';
  const fromId = searchParams.get('from') ?? '';
  const toId = searchParams.get('to') ?? '';
  const [compareFromId, setCompareFromId] = useState(fromId);
  const [compareToId, setCompareToId] = useState(toId);

  const { data: doc, isPending: docPending } = useQuery({
    queryKey: ['document', documentId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/documents/${documentId}`);
      if (!res.ok) throw new Error('Failed to load document');
      return res.json() as Promise<{ title: string }>;
    },
    enabled: !!documentId,
  });

  const { data: versionsData, isPending: versionsPending } = useQuery({
    queryKey: ['document-versions', documentId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/documents/${documentId}/versions`);
      if (!res.ok) throw new Error('Failed to load versions');
      return res.json() as Promise<{ items: VersionItem[] }>;
    },
    enabled: !!documentId,
  });

  const versions = versionsData?.items ?? [];
  const fromVersion = versions.find((v) => v.id === (fromId || compareFromId));
  const toVersion = versions.find((v) => v.id === (toId || compareToId));

  const { data: fromDetail, isPending: fromPending } = useQuery({
    queryKey: ['document-version', documentId, fromId || compareFromId],
    queryFn: async () => {
      const id = fromId || compareFromId;
      const res = await apiFetch(`/api/v1/documents/${documentId}/versions/${id}`);
      if (!res.ok) throw new Error('Failed to load version');
      return res.json() as Promise<VersionDetail>;
    },
    enabled: !!documentId && !!(fromId || compareFromId),
  });

  const { data: toDetail, isPending: toPending } = useQuery({
    queryKey: ['document-version', documentId, toId || compareToId],
    queryFn: async () => {
      const id = toId || compareToId;
      const res = await apiFetch(`/api/v1/documents/${documentId}/versions/${id}`);
      if (!res.ok) throw new Error('Failed to load version');
      return res.json() as Promise<VersionDetail>;
    },
    enabled: !!documentId && !!(toId || compareToId),
  });

  const { data: viewDetail, isPending: viewPending } = useQuery({
    queryKey: ['document-version', documentId, viewVersionId],
    queryFn: async () => {
      const res = await apiFetch(`/api/v1/documents/${documentId}/versions/${viewVersionId}`);
      if (!res.ok) throw new Error('Failed to load version');
      return res.json() as Promise<VersionDetail>;
    },
    enabled: !!documentId && !!viewVersionId,
  });

  const showCompare = (fromId || compareFromId) && (toId || compareToId);
  const comparePending = fromPending || toPending;
  const showSingleVersion = !!viewVersionId && !showCompare;
  const canApplyCompare = compareFromId && compareToId && compareFromId !== compareToId;

  const handleCompare = () => {
    if (!canApplyCompare) return;
    setSearchParams({ from: compareFromId, to: compareToId });
  };

  const versionOptions = versions.map((v) => ({
    value: v.id,
    label: `v${v.versionNumber} – ${new Date(v.createdAt).toLocaleString()}${v.createdByName ? ` (${v.createdByName})` : ''}`,
  }));

  if (docPending || !documentId) {
    return (
      <Stack gap="md">
        <Skeleton height={32} width="60%" />
        <Skeleton height={200} />
      </Stack>
    );
  }

  return (
    <>
      <PageHeader
        title="Version history"
        breadcrumbs={
          <Group gap="xs">
            <Button variant="subtle" size="compact-sm" component={Link} to="/catalog">
              Catalog
            </Button>
            <Text size="sm" c="dimmed">
              /
            </Text>
            <Button
              variant="subtle"
              size="compact-sm"
              component={Link}
              to={`/documents/${documentId}`}
            >
              {doc?.title ?? 'Document'}
            </Button>
            <Text size="sm" c="dimmed">
              / History
            </Text>
          </Group>
        }
      />

      <Stack gap="lg">
        {versionsPending ? (
          <Skeleton height={120} />
        ) : versions.length === 0 ? (
          <Text size="sm" c="dimmed">
            No published versions yet. Publish the document to create version 1.
          </Text>
        ) : (
          <>
            <Card withBorder padding="md">
              <Text size="sm" fw={500} mb="xs">
                Versions
              </Text>
              <Stack gap="xs">
                {versions.map((v) => (
                  <Group key={v.id} justify="space-between" wrap="nowrap">
                    <Group gap="xs">
                      <Badge size="sm" variant="light">
                        v{v.versionNumber}
                      </Badge>
                      <Text size="sm">
                        {new Date(v.createdAt).toLocaleString()}
                        {v.createdByName ? ` · ${v.createdByName}` : ''}
                      </Text>
                    </Group>
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      component={Link}
                      to={`/documents/${documentId}/versions?version=${v.id}`}
                    >
                      View
                    </Button>
                  </Group>
                ))}
              </Stack>
            </Card>

            <Card withBorder padding="md">
              <Text size="sm" fw={500} mb="xs">
                Compare two versions
              </Text>
              <Group align="flex-end" gap="sm" wrap="wrap">
                <NativeSelect
                  label="From version"
                  data={[{ value: '', label: 'Select…' }, ...versionOptions]}
                  value={fromId || compareFromId}
                  onChange={(e) => setCompareFromId(e.target.value)}
                  style={{ minWidth: 280 }}
                />
                <NativeSelect
                  label="To version"
                  data={[{ value: '', label: 'Select…' }, ...versionOptions]}
                  value={toId || compareToId}
                  onChange={(e) => setCompareToId(e.target.value)}
                  style={{ minWidth: 280 }}
                />
                <Button disabled={!canApplyCompare} onClick={handleCompare} size="sm">
                  Compare
                </Button>
              </Group>
            </Card>

            {showSingleVersion && (
              <Card withBorder padding="md">
                <Text size="sm" fw={500} mb="xs">
                  Version content
                  {viewDetail && (
                    <Text component="span" size="sm" c="dimmed" ml="xs">
                      v{viewDetail.versionNumber}
                      {viewDetail.createdByName ? ` · ${viewDetail.createdByName}` : ''}
                    </Text>
                  )}
                </Text>
                {viewPending ? (
                  <Skeleton height={200} />
                ) : viewDetail ? (
                  <Box
                    component="pre"
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontFamily: 'var(--mantine-font-family-monospace)',
                      fontSize: 'var(--mantine-font-size-sm)',
                      padding: 'var(--mantine-spacing-md)',
                      borderRadius: 'var(--mantine-radius-md)',
                      backgroundColor: 'var(--mantine-color-dark-6)',
                      overflow: 'auto',
                    }}
                  >
                    {viewDetail.content}
                  </Box>
                ) : null}
              </Card>
            )}

            {showCompare && (
              <Card withBorder padding="md">
                <Text size="sm" fw={500} mb="xs">
                  Diff
                  {fromVersion && toVersion && (
                    <Text component="span" size="sm" c="dimmed" ml="xs">
                      v{fromVersion.versionNumber} → v{toVersion.versionNumber}
                    </Text>
                  )}
                </Text>
                {comparePending ? (
                  <Skeleton height={200} />
                ) : fromDetail && toDetail ? (
                  <DiffView fromContent={fromDetail.content} toContent={toDetail.content} />
                ) : null}
              </Card>
            )}
          </>
        )}
      </Stack>
    </>
  );
}
