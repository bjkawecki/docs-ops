import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Pagination,
  Select,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../api/client';

type AdminJobRow = {
  id: string;
  jobName: string;
  state: string;
  priority: number;
  retryCount: number;
  retryLimit: number;
  createdOn: string;
  startedOn: string | null;
  completedOn: string | null;
};

type ListJobsResponse = {
  items: AdminJobRow[];
  total: number;
  limit: number;
  offset: number;
};

type HealthResponse = {
  status: 'ok' | 'degraded' | 'error';
  queueReachable: boolean;
  workerConnected: boolean;
  lastWorkerHeartbeat: string | null;
  queues: Array<{
    jobName: string;
    queuedCount: number;
    activeCount: number;
    totalCount: number;
  }>;
};

type SchedulesResponse = {
  availableJobNames: string[];
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const POLLING_SECONDS_OPTIONS = [0, 2, 5, 10, 30] as const;
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_POLLING_SECONDS = 5;
const JOBS_PAGE_SIZE_KEY = 'docsops-admin-jobs-page-size';
const JOBS_POLLING_SECONDS_KEY = 'docsops-admin-jobs-polling-seconds';

function parseStoredNumber(key: string, allowed: readonly number[], fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = Number(raw);
    return allowed.includes(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function formatRelativeAge(fromMs: number | null, referenceMs: number = Date.now()): string {
  if (!fromMs) return 'n/a';
  const diffMs = referenceMs - fromMs;
  if (diffMs < 1000) return 'just now';
  const seconds = Math.max(1, Math.floor(diffMs / 1000));
  if (seconds < 60) return `vor ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `vor ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.floor(hours / 24);
  return `vor ${days}d`;
}

export function AdminJobsTab() {
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<string>('all');
  const [jobName, setJobName] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState<number>(() =>
    parseStoredNumber(JOBS_PAGE_SIZE_KEY, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE)
  );
  const [pollingSeconds, setPollingSeconds] = useState<number>(() =>
    parseStoredNumber(JOBS_POLLING_SECONDS_KEY, POLLING_SECONDS_OPTIONS, DEFAULT_POLLING_SECONDS)
  );
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const pollingMs = pollingSeconds > 0 ? pollingSeconds * 1000 : false;

  const jobsQueryString = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('limit', String(limit));
    sp.set('offset', String(offset));
    if (state !== 'all') sp.set('state', state);
    if (jobName !== 'all') sp.set('jobName', jobName);
    if (search.trim()) sp.set('search', search.trim());
    return sp.toString();
  }, [limit, offset, state, jobName, search]);

  const jobs = useQuery({
    queryKey: ['admin', 'jobs', limit, offset, state, jobName, search],
    queryFn: async (): Promise<ListJobsResponse> => {
      const res = await apiFetch(`/api/v1/admin/jobs?${jobsQueryString}`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to load jobs');
      }
      return (await res.json()) as ListJobsResponse;
    },
    refetchInterval: pollingMs,
    refetchIntervalInBackground: pollingMs !== false,
  });

  const health = useQuery({
    queryKey: ['admin', 'jobs', 'health'],
    queryFn: async (): Promise<HealthResponse> => {
      const res = await apiFetch('/api/v1/admin/jobs/health', { cache: 'no-store' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to load job health');
      }
      return (await res.json()) as HealthResponse;
    },
    refetchInterval: pollingMs,
    refetchIntervalInBackground: pollingMs !== false,
  });

  const schedules = useQuery({
    queryKey: ['admin', 'jobs', 'schedules'],
    queryFn: async (): Promise<SchedulesResponse> => {
      const res = await apiFetch('/api/v1/admin/jobs/schedules');
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to load schedules');
      }
      return (await res.json()) as SchedulesResponse;
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiFetch(`/api/v1/admin/jobs/${jobId}/retry`, { method: 'POST' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Retry failed');
      }
    },
    onSuccess: () => {
      notifications.show({ title: 'Job retried', message: 'Retry was triggered.', color: 'green' });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    },
    onError: (error: Error) => {
      notifications.show({ title: 'Error', message: error.message, color: 'red' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiFetch(`/api/v1/admin/jobs/${jobId}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Cancel failed');
      }
    },
    onSuccess: () => {
      notifications.show({
        title: 'Job cancelled',
        message: 'Cancellation request was submitted.',
        color: 'green',
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    },
    onError: (error: Error) => {
      notifications.show({ title: 'Error', message: error.message, color: 'red' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiFetch(`/api/v1/admin/jobs/${jobId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Delete failed');
      }
    },
    onSuccess: () => {
      notifications.show({ title: 'Job deleted', message: 'Job was removed.', color: 'green' });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    },
    onError: (error: Error) => {
      notifications.show({ title: 'Error', message: error.message, color: 'red' });
    },
  });

  if (jobs.isPending || health.isPending || schedules.isPending) {
    return <Loader size="sm" />;
  }

  if (jobs.isError || health.isError || schedules.isError) {
    const jobsErrorMessage =
      jobs.error instanceof Error
        ? jobs.error.message
        : health.error instanceof Error
          ? health.error.message
          : schedules.error instanceof Error
            ? schedules.error.message
            : 'Unknown error';
    return (
      <Alert color="red" title="Failed to load admin jobs">
        {jobsErrorMessage}
      </Alert>
    );
  }

  const totalPages = Math.max(1, Math.ceil((jobs.data?.total ?? 0) / limit));
  const lastHealthRefreshMs = health.dataUpdatedAt > 0 ? health.dataUpdatedAt : null;
  const lastHealthRefreshAbsolute = lastHealthRefreshMs
    ? new Date(lastHealthRefreshMs).toLocaleString()
    : 'n/a';

  return (
    <Box>
      <Group mb="md" justify="space-between" align="flex-end" wrap="wrap">
        <Group gap="sm" align="flex-end" wrap="wrap">
          <Select
            label="State"
            value={state}
            onChange={(value) => {
              setState(value ?? 'all');
              setOffset(0);
            }}
            data={[
              { value: 'all', label: 'All' },
              { value: 'created', label: 'created' },
              { value: 'retry', label: 'retry' },
              { value: 'active', label: 'active' },
              { value: 'completed', label: 'completed' },
              { value: 'failed', label: 'failed' },
              { value: 'cancelled', label: 'cancelled' },
              { value: 'expired', label: 'expired' },
            ]}
            style={{ minWidth: 140 }}
          />
          <Select
            label="Job type"
            value={jobName}
            onChange={(value) => {
              setJobName(value ?? 'all');
              setOffset(0);
            }}
            data={[
              { value: 'all', label: 'All' },
              ...(schedules.data?.availableJobNames ?? []).map((name) => ({
                value: name,
                label: name,
              })),
            ]}
            style={{ minWidth: 220 }}
          />
          <TextInput
            label="Search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setSearch(searchInput);
                setOffset(0);
              }
            }}
            placeholder="id, payload, queue name"
            style={{ minWidth: 220 }}
          />
          <Button
            variant="light"
            onClick={() => {
              setSearch(searchInput);
              setOffset(0);
            }}
          >
            Search
          </Button>
        </Group>
        <Group gap="sm" align="flex-end" wrap="wrap">
          <Select
            label="Per page"
            data={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
            value={String(limit)}
            onChange={(value) => {
              const next = Number(value ?? DEFAULT_PAGE_SIZE);
              setLimit(next);
              setOffset(0);
              try {
                window.localStorage.setItem(JOBS_PAGE_SIZE_KEY, String(next));
              } catch {
                /* ignore */
              }
            }}
            style={{ width: 100 }}
          />
          <Select
            label="Aktualisierung (s)"
            data={POLLING_SECONDS_OPTIONS.map((n) => ({
              value: String(n),
              label: n === 0 ? 'Off' : String(n),
            }))}
            value={String(pollingSeconds)}
            onChange={(value) => {
              const next = Number(value ?? DEFAULT_POLLING_SECONDS);
              setPollingSeconds(next);
              try {
                window.localStorage.setItem(JOBS_POLLING_SECONDS_KEY, String(next));
              } catch {
                /* ignore */
              }
              void jobs.refetch();
              void health.refetch();
            }}
            style={{ width: 120 }}
          />
        </Group>
      </Group>

      <Group mb="xs" justify="space-between" align="center" wrap="wrap">
        <Group gap={6} wrap="nowrap" align="center">
          <Badge color={health.data?.workerConnected ? 'green' : 'yellow'} variant="light">
            {health.data?.workerConnected ? 'Worker OK' : 'Worker degraded'}
          </Badge>
          <Text size="xs" c="dimmed" title={`Zuletzt aktualisiert: ${lastHealthRefreshAbsolute}`}>
            Zuletzt aktualisiert: {formatRelativeAge(lastHealthRefreshMs, nowMs)}
          </Text>
        </Group>
        <Text size="sm" c="dimmed">
          {jobs.data?.total ?? 0} job(s)
        </Text>
      </Group>

      <Table withTableBorder withColumnBorders className="admin-table-hover">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Queue</Table.Th>
            <Table.Th>State</Table.Th>
            <Table.Th>Retry</Table.Th>
            <Table.Th>Created</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(jobs.data?.items ?? []).length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text size="sm" c="dimmed">
                  No jobs found.
                </Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            (jobs.data?.items ?? []).map((job) => (
              <Table.Tr key={job.id}>
                <Table.Td>
                  <Text size="sm">{job.jobName}</Text>
                  <Text size="xs" c="dimmed">
                    {job.id}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={
                      job.state === 'completed'
                        ? 'green'
                        : job.state === 'failed'
                          ? 'red'
                          : job.state === 'active'
                            ? 'blue'
                            : 'gray'
                    }
                  >
                    {job.state}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {job.retryCount}/{job.retryLimit}
                </Table.Td>
                <Table.Td>{new Date(job.createdOn).toLocaleString()}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => retryMutation.mutate(job.id)}
                      disabled={retryMutation.isPending}
                    >
                      Retry
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="red"
                      onClick={() => cancelMutation.mutate(job.id)}
                      disabled={cancelMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="gray"
                      onClick={() => {
                        const confirmed = window.confirm('Delete this job permanently?');
                        if (!confirmed) return;
                        deleteMutation.mutate(job.id);
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
      {totalPages > 1 && (
        <Group justify="flex-end" mt="md">
          <Pagination
            value={Math.floor(offset / limit) + 1}
            onChange={(page) => setOffset((page - 1) * limit)}
            total={totalPages}
            size="sm"
          />
        </Group>
      )}
    </Box>
  );
}
