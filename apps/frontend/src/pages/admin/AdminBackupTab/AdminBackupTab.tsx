import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { apiBase, apiFetch } from '../../../api/client';
import { AdminBackupDestinationsManageModal } from './AdminBackupDestinationsManageModal';
import { buildDestinationBody, type DestinationFormState } from './adminBackupDestinationForm';
import { AdminBackupEnableAutoModal } from './AdminBackupEnableAutoModal';
import { AdminBackupHistorySection } from './AdminBackupHistorySection';
import { AdminBackupOverviewBar } from './AdminBackupOverviewBar';
import { AdminBackupStatusAlerts } from './AdminBackupStatusAlerts';
import { type BackupRun, type BackupStatus, type Destination } from './adminBackupTypes';
import {
  BACKUP_POLL_BOOST_MS,
  BACKUP_RUN_POLL_INTERVAL_MS,
  isInProgressBackupStatus,
  shouldPollBackupRuns,
} from './backupRunPolling';

const DEFAULT_AUTO_CRON = '0 3 * * *';
const DEFAULT_AUTO_TZ = 'UTC';

type CreateBackupResult = { backupRunId: string; jobId: string };

export function AdminBackupTab() {
  const queryClient = useQueryClient();
  const [manageOpened, { open: openManage, close: closeManage }] = useDisclosure(false);
  const [enableAutoOpened, { open: openEnableAuto, close: closeEnableAuto }] = useDisclosure(false);
  const backupRunStatusSnapshot = useRef<Map<string, string>>(new Map());
  const backupRunStatusInitialized = useRef(false);
  const pendingBackupRunIds = useRef(new Set<string>());
  const [backupPollBoostUntil, setBackupPollBoostUntil] = useState(0);

  const statusQuery = useQuery({
    queryKey: ['admin', 'backups', 'status'],
    queryFn: async (): Promise<BackupStatus> => {
      const res = await apiFetch('/api/v1/admin/backups/status');
      if (!res.ok) throw new Error('Failed to load backup status');
      return (await res.json()) as BackupStatus;
    },
    refetchInterval: (q) => {
      const runs = queryClient.getQueryData<{ items: BackupRun[] }>(['admin', 'backups', 'runs']);
      const polling = shouldPollBackupRuns(runs?.items, backupPollBoostUntil);
      return polling || q.state.data?.maintenanceActive ? BACKUP_RUN_POLL_INTERVAL_MS : 15000;
    },
  });

  const destinationsQuery = useQuery({
    queryKey: ['admin', 'backups', 'destinations'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/admin/backup-destinations');
      if (!res.ok) throw new Error('Failed to load external destinations');
      return (await res.json()) as { items: Destination[] };
    },
  });

  const runsQuery = useQuery({
    queryKey: ['admin', 'backups', 'runs'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/admin/backups?limit=25&offset=0');
      if (!res.ok) throw new Error('Failed to load backups');
      return (await res.json()) as { items: BackupRun[] };
    },
    refetchInterval: (query) => {
      const polling = shouldPollBackupRuns(query.state.data?.items, backupPollBoostUntil);
      return polling ? BACKUP_RUN_POLL_INTERVAL_MS : false;
    },
  });

  useEffect(() => {
    const items = runsQuery.data?.items;
    if (!items) return;

    if (!backupRunStatusInitialized.current) {
      for (const run of items) {
        backupRunStatusSnapshot.current.set(run.id, run.status);
      }
      backupRunStatusInitialized.current = true;
      return;
    }

    for (const run of items) {
      const previous = backupRunStatusSnapshot.current.get(run.id);
      if (previous === run.status) continue;
      backupRunStatusSnapshot.current.set(run.id, run.status);

      const isPending = pendingBackupRunIds.current.has(run.id);
      const wasInProgress = previous != null && isInProgressBackupStatus(previous);
      const notifyTerminal =
        run.status === 'failed' || run.status === 'succeeded' ? isPending || wasInProgress : false;

      if (!notifyTerminal) continue;

      pendingBackupRunIds.current.delete(run.id);

      if (run.status === 'failed') {
        notifications.show({
          title: 'Backup failed',
          message: run.errorMessage ?? 'Unknown error',
          color: 'red',
          autoClose: 10_000,
        });
      } else {
        notifications.show({
          title: 'Backup completed',
          message: '',
          color: 'green',
        });
      }
    }
  }, [runsQuery.data?.items]);

  const invalidateBackup = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'jobs', 'schedules'] });
  };

  const patchSettings = useMutation({
    mutationFn: async (body: { retentionCount?: number; defaultDestinationId?: string | null }) => {
      const res = await apiFetch('/api/v1/admin/backups/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to save settings');
      }
      return res.json() as Promise<unknown>;
    },
    onSuccess: () => {
      invalidateBackup();
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Error', message: e.message, color: 'red' });
    },
  });

  const saveDestination = useMutation({
    mutationFn: async ({
      form,
      destinationId,
    }: {
      form: DestinationFormState;
      destinationId: string | null;
    }) => {
      const isEdit = destinationId != null;
      const body = buildDestinationBody(form, isEdit);
      const res = await apiFetch(
        isEdit
          ? `/api/v1/admin/backup-destinations/${destinationId}`
          : '/api/v1/admin/backup-destinations',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to save external destination');
      }
      return res.json() as Promise<unknown>;
    },
    onSuccess: () => {
      invalidateBackup();
      notifications.show({ title: 'External destination saved', message: '', color: 'green' });
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Error', message: e.message, color: 'red' });
    },
  });

  const deleteDestinationMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/v1/admin/backup-destinations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete external destination');
    },
    onSuccess: () => {
      invalidateBackup();
      notifications.show({ title: 'External destination deleted', message: '', color: 'green' });
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Error', message: e.message, color: 'red' });
    },
  });

  const patchDestinationEnabled = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiFetch(`/api/v1/admin/backup-destinations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update external destination');
      }
      return res.json() as Promise<unknown>;
    },
    onSuccess: () => {
      invalidateBackup();
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Error', message: e.message, color: 'red' });
    },
  });

  const patchSchedule = useMutation({
    mutationFn: async (body: { enabled: boolean; cron?: string; tz?: string }) => {
      const res = await apiFetch('/api/v1/admin/backups/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update schedule');
      }
      return res.json() as Promise<unknown>;
    },
    onSuccess: () => {
      invalidateBackup();
      notifications.show({ title: 'Schedule updated', message: '', color: 'green' });
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Error', message: e.message, color: 'red' });
    },
  });

  const createBackup = useMutation({
    mutationFn: async (destinationId?: string) => {
      const res = await apiFetch('/api/v1/admin/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(destinationId ? { destinationId } : {}),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to start backup');
      }
      return res.json() as Promise<CreateBackupResult>;
    },
    onSuccess: (result) => {
      pendingBackupRunIds.current.add(result.backupRunId);
      backupRunStatusSnapshot.current.set(result.backupRunId, 'queued');
      setBackupPollBoostUntil(Date.now() + BACKUP_POLL_BOOST_MS);
      invalidateBackup();
      void runsQuery.refetch();
      notifications.show({ title: 'Backup started', message: '', color: 'blue' });
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Error', message: e.message, color: 'red' });
    },
  });

  const [downloadingBackupId, setDownloadingBackupId] = useState<string | null>(null);

  const handleDownloadBackup = (id: string) => {
    setDownloadingBackupId(id);
    const anchor = document.createElement('a');
    anchor.href = `${apiBase}/api/v1/admin/backups/${id}/download`;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => setDownloadingBackupId(null), 1500);
  };

  const deleteLocalBackup = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/v1/admin/backups/${id}/local`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete local copy');
      }
      return (await res.json()) as BackupRun;
    },
    onSuccess: () => {
      invalidateBackup();
      notifications.show({ title: 'Local copy deleted', message: '', color: 'green' });
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Error', message: e.message, color: 'red' });
    },
  });

  const destinations = useMemo(
    () => destinationsQuery.data?.items ?? [],
    [destinationsQuery.data?.items]
  );

  if (statusQuery.isPending) return <Loader size="sm" />;

  const status = statusQuery.data;
  if (!status) return null;

  const canBackup =
    status.minioAvailable && status.encryptionConfigured && !status.maintenanceActive;

  const canEnableAuto =
    status.encryptionConfigured && status.defaultDestinationId != null && status.minioAvailable;

  const enableBlockReason = !status.encryptionConfigured
    ? 'BACKUP_ENCRYPTION_KEY is not configured'
    : !status.defaultDestinationId
      ? 'Set a default external destination first'
      : !status.minioAvailable
        ? 'Object storage is unavailable'
        : null;

  return (
    <Stack gap="md">
      <AdminBackupStatusAlerts status={status} />

      <AdminBackupOverviewBar
        status={status}
        destinations={destinations}
        retentionCount={status.retentionCount}
        onRetentionChange={(retentionCount) => patchSettings.mutate({ retentionCount })}
        onDefaultDestinationChange={(defaultDestinationId) =>
          patchSettings.mutate({ defaultDestinationId })
        }
        canBackup={canBackup}
        canEnableAuto={canEnableAuto}
        enableBlockReason={enableBlockReason}
        scheduleSaving={patchSchedule.isPending}
        backupLoading={createBackup.isPending}
        onAutoToggle={(enabled) => {
          if (enabled) {
            openEnableAuto();
          } else {
            patchSchedule.mutate({ enabled: false });
          }
        }}
        onManageDestinations={openManage}
        onBackupNow={() => createBackup.mutate(status.defaultDestinationId ?? undefined)}
      />

      <AdminBackupHistorySection
        runs={runsQuery.data?.items}
        loading={runsQuery.isPending}
        downloadLoading={downloadingBackupId != null}
        deleteLocalLoading={deleteLocalBackup.isPending}
        onDownload={handleDownloadBackup}
        onDeleteLocal={(id) => deleteLocalBackup.mutate(id)}
      />

      <AdminBackupDestinationsManageModal
        opened={manageOpened}
        onClose={closeManage}
        destinations={destinations}
        defaultDestinationId={status.defaultDestinationId}
        savingDestination={saveDestination.isPending}
        deletingDestination={deleteDestinationMutation.isPending}
        togglingDestinationId={
          patchDestinationEnabled.isPending ? (patchDestinationEnabled.variables?.id ?? null) : null
        }
        onSaveDestination={async (form, destinationId) => {
          await saveDestination.mutateAsync({ form, destinationId });
        }}
        onDeleteDestination={(d) => deleteDestinationMutation.mutate(d.id)}
        onSetDefault={(destinationId) =>
          patchSettings.mutate({ defaultDestinationId: destinationId })
        }
        onToggleEnabled={(destinationId, enabled) => {
          patchDestinationEnabled.mutate(
            { id: destinationId, enabled },
            {
              onSuccess: () => {
                if (!enabled && status.defaultDestinationId === destinationId) {
                  patchSettings.mutate({ defaultDestinationId: null });
                }
              },
            }
          );
        }}
      />

      <AdminBackupEnableAutoModal
        opened={enableAutoOpened}
        onClose={closeEnableAuto}
        loading={patchSchedule.isPending}
        onConfirm={() => {
          patchSchedule.mutate(
            { enabled: true, cron: DEFAULT_AUTO_CRON, tz: DEFAULT_AUTO_TZ },
            { onSuccess: () => closeEnableAuto() }
          );
        }}
      />
    </Stack>
  );
}
