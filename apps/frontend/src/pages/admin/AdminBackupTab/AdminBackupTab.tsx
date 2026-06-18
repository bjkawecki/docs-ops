import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader, Stack } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { apiBase, apiFetch } from '../../../api/client';
import { meQueryKey } from '../../../hooks/useMe';
import { buildDestinationBody, type DestinationFormState } from './adminBackupDestinationForm';
import { AdminBackupEnableAutoModal } from './AdminBackupEnableAutoModal';
import { AdminBackupHistorySection } from './AdminBackupHistorySection';
import { AdminBackupOverviewBar } from './AdminBackupOverviewBar';
import { AdminBackupSettingsModal, type BackupSettingsTab } from './AdminBackupSettingsModal';
import { AdminBackupStatusAlerts } from './AdminBackupStatusAlerts';
import { formatActiveJobStatus } from './backupRestoreHelpers';
import {
  type BackupRun,
  type BackupStatus,
  type Destination,
  type RestoreRun,
} from './adminBackupTypes';
import {
  hasInProgressRestoreRun,
  isInProgressRestoreStatus,
  isSupersededMaintenanceFailure,
  isSupersededRestoreFailure,
} from './restoreRunPolling';
import {
  BACKUP_POLL_BOOST_MS,
  BACKUP_RUN_IDLE_POLL_INTERVAL_MS,
  BACKUP_RUN_POLL_INTERVAL_MS,
  getBackupRunsRefetchIntervalMs,
  hasInProgressBackupRun,
  isInProgressBackupStatus,
  shouldPollBackupRuns,
} from './backupRunPolling';

const DEFAULT_AUTO_CRON = '0 3 * * *';
const DEFAULT_AUTO_TZ = 'UTC';

type CreateBackupResult = { backupRunId: string; jobId: string };

export function AdminBackupTab() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [settingsInitialTab, setSettingsInitialTab] = useState<BackupSettingsTab>('general');
  const [settingsOpened, { open: openSettings, close: closeSettings }] = useDisclosure(false);
  const [enableAutoOpened, { open: openEnableAuto, close: closeEnableAuto }] = useDisclosure(false);
  const backupRunStatusSnapshot = useRef<Map<string, string>>(new Map());
  const backupRunStatusInitialized = useRef(false);
  const pendingBackupRunIds = useRef(new Set<string>());
  const pendingRestoreRunIds = useRef(new Set<string>());
  const restoreRunStatusSnapshot = useRef<Map<string, string>>(new Map());
  const restoreRunStatusInitialized = useRef(false);
  const [backupPollBoostUntil, setBackupPollBoostUntil] = useState(0);
  const [restorePollBoostUntil, setRestorePollBoostUntil] = useState(0);
  const [isTabVisible, setIsTabVisible] = useState(() => document.visibilityState === 'visible');

  useEffect(() => {
    const onVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsTabVisible(visible);
      if (visible) {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [queryClient]);

  const openBackupSettings = useCallback(
    (tab: BackupSettingsTab = 'general') => {
      setSettingsInitialTab(tab);
      openSettings();
    },
    [openSettings]
  );

  const statusQuery = useQuery({
    queryKey: ['admin', 'backups', 'status'],
    queryFn: async (): Promise<BackupStatus> => {
      const res = await apiFetch('/api/v1/admin/backups/status');
      if (!res.ok) throw new Error('Failed to load backup status');
      return (await res.json()) as BackupStatus;
    },
    refetchInterval: (q) => {
      const runs = queryClient.getQueryData<{ items: BackupRun[] }>(['admin', 'backups', 'runs']);
      const polling =
        shouldPollBackupRuns(runs?.items, backupPollBoostUntil) ||
        hasInProgressRestoreRun(
          queryClient.getQueryData<{ items: RestoreRun[] }>(['admin', 'restores', 'runs'])?.items
        );
      const fastPoll = polling || q.state.data?.maintenanceActive;
      if (fastPoll) return BACKUP_RUN_POLL_INTERVAL_MS;
      return isTabVisible ? BACKUP_RUN_IDLE_POLL_INTERVAL_MS : false;
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

  const restoresQuery = useQuery({
    queryKey: ['admin', 'restores', 'runs'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/admin/restores?limit=10&offset=0');
      if (!res.ok) throw new Error('Failed to load restores');
      return (await res.json()) as { items: RestoreRun[] };
    },
    refetchInterval: (query) => {
      const fast =
        hasInProgressRestoreRun(query.state.data?.items) ||
        Date.now() < restorePollBoostUntil ||
        statusQuery.data?.maintenanceActive;
      if (fast) return BACKUP_RUN_POLL_INTERVAL_MS;
      return isTabVisible ? BACKUP_RUN_IDLE_POLL_INTERVAL_MS : false;
    },
  });

  const invalidateBackup = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'restores'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'jobs', 'schedules'] });
  }, [queryClient]);

  useEffect(() => {
    const items = restoresQuery.data?.items;
    if (!items) return;

    if (!restoreRunStatusInitialized.current) {
      for (const run of items) {
        restoreRunStatusSnapshot.current.set(run.id, run.status);
      }
      restoreRunStatusInitialized.current = true;
      return;
    }

    for (const run of items) {
      const previous = restoreRunStatusSnapshot.current.get(run.id);
      if (previous === run.status) continue;
      restoreRunStatusSnapshot.current.set(run.id, run.status);

      const isPending = pendingRestoreRunIds.current.has(run.id);
      const wasInProgress = previous != null && isInProgressRestoreStatus(previous);
      const notifyTerminal =
        run.status === 'failed' || run.status === 'succeeded' ? isPending || wasInProgress : false;

      if (!notifyTerminal) continue;
      pendingRestoreRunIds.current.delete(run.id);

      if (run.status === 'failed') {
        if (isSupersededRestoreFailure(run)) continue;
        notifications.show({
          title: 'Restore failed',
          message: run.errorMessage ?? 'Unknown error',
          color: 'red',
          autoClose: 10_000,
        });
      } else {
        invalidateBackup();
        void queryClient.removeQueries({ queryKey: meQueryKey });
        notifications.show({
          title: 'Restore completed',
          message:
            'Database and object storage were restored. All sessions were invalidated — sign in again to continue.',
          color: 'green',
          autoClose: 15_000,
        });
        void navigate('/login', { replace: true, state: { from: '/admin/backup' } });
      }
    }
  }, [restoresQuery.data?.items, invalidateBackup, navigate, queryClient]);

  const runsQuery = useQuery({
    queryKey: ['admin', 'backups', 'runs'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/admin/backups?limit=25&offset=0');
      if (!res.ok) throw new Error('Failed to load backups');
      return (await res.json()) as { items: BackupRun[] };
    },
    refetchInterval: (query) =>
      getBackupRunsRefetchIntervalMs({
        runs: query.state.data?.items,
        pollBoostUntilMs: backupPollBoostUntil,
        maintenanceActive: statusQuery.data?.maintenanceActive,
        isTabVisible,
      }),
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
        if (isSupersededMaintenanceFailure(run)) continue;
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

  const deleteBackup = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/v1/admin/backups/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete backup');
      }
    },
    onSuccess: () => {
      invalidateBackup();
      notifications.show({ title: 'Backup deleted', message: '', color: 'green' });
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Error', message: e.message, color: 'red' });
    },
  });

  const triggerRestore = useMutation({
    mutationFn: async (backupRunId: string) => {
      const res = await apiFetch(`/api/v1/admin/restores/from-backup/${backupRunId}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to start restore');
      }
      return res.json() as Promise<{ restoreRunId: string; jobId: string }>;
    },
    onSuccess: (result) => {
      pendingRestoreRunIds.current.add(result.restoreRunId);
      restoreRunStatusSnapshot.current.set(result.restoreRunId, 'queued');
      setRestorePollBoostUntil(Date.now() + BACKUP_POLL_BOOST_MS);
      closeSettings();
      invalidateBackup();
      notifications.show({ title: 'Restore started', message: '', color: 'blue' });
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Error', message: e.message, color: 'red' });
    },
  });

  const deleteFailedBackup = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/v1/admin/backups/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete backup run');
      }
    },
    onSuccess: () => {
      invalidateBackup();
      notifications.show({ title: 'Backup run removed', message: '', color: 'green' });
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Error', message: e.message, color: 'red' });
    },
  });

  const handleRestoreUploadComplete = (restoreRunId: string) => {
    pendingRestoreRunIds.current.add(restoreRunId);
    restoreRunStatusSnapshot.current.set(restoreRunId, 'queued');
    setRestorePollBoostUntil(Date.now() + BACKUP_POLL_BOOST_MS);
    invalidateBackup();
    notifications.show({ title: 'Restore started', message: '', color: 'blue' });
  };

  const destinations = useMemo(
    () => destinationsQuery.data?.items ?? [],
    [destinationsQuery.data?.items]
  );

  const activeRestoreStatus = useMemo(() => {
    const inProgress = restoresQuery.data?.items?.find((r) => isInProgressRestoreStatus(r.status));
    return inProgress?.status ?? null;
  }, [restoresQuery.data?.items]);

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

  const activeJobStatus = formatActiveJobStatus({
    maintenanceActive: status.maintenanceActive,
    maintenanceReason: status.maintenanceReason,
    backupRuns: runsQuery.data?.items,
    restoreStatus: activeRestoreStatus,
  });

  const showActiveJobStatus =
    activeJobStatus ??
    (hasInProgressBackupRun(runsQuery.data?.items)
      ? formatActiveJobStatus({
          maintenanceActive: true,
          maintenanceReason: 'backup',
          backupRuns: runsQuery.data?.items,
        })
      : null);

  return (
    <Stack gap="md">
      <AdminBackupStatusAlerts status={status} />

      <AdminBackupOverviewBar
        status={status}
        destinations={destinations}
        activeJobStatus={showActiveJobStatus}
        canBackup={canBackup}
        canEnableAuto={canEnableAuto}
        enableBlockReason={enableBlockReason}
        scheduleSaving={patchSchedule.isPending}
        backupLoading={createBackup.isPending}
        onRetentionChange={(retentionCount) => patchSettings.mutate({ retentionCount })}
        onDefaultDestinationChange={(defaultDestinationId) =>
          patchSettings.mutate({ defaultDestinationId })
        }
        onAutoToggle={(enabled) => {
          if (enabled) {
            openEnableAuto();
          } else {
            patchSchedule.mutate({ enabled: false });
          }
        }}
        onOpenSettings={() => openBackupSettings('general')}
        onBackupNow={() => createBackup.mutate(status.defaultDestinationId ?? undefined)}
      />

      <AdminBackupHistorySection
        runs={runsQuery.data?.items}
        loading={runsQuery.isPending}
        downloadLoading={downloadingBackupId != null}
        deleteBackupLoading={deleteBackup.isPending}
        deleteRunLoading={deleteFailedBackup.isPending}
        onDownload={handleDownloadBackup}
        onDeleteBackup={async (id) => {
          await deleteBackup.mutateAsync(id);
        }}
        onDeleteRun={async (id) => {
          await deleteFailedBackup.mutateAsync(id);
        }}
        onOpenDestinationSettings={() => openBackupSettings('destinations')}
      />

      <AdminBackupSettingsModal
        opened={settingsOpened}
        onClose={closeSettings}
        initialTab={settingsInitialTab}
        status={status}
        destinations={destinations}
        backups={runsQuery.data?.items}
        canEnableAuto={canEnableAuto}
        enableBlockReason={enableBlockReason}
        scheduleSaving={patchSchedule.isPending}
        restoreFromBackupLoading={triggerRestore.isPending}
        savingDestination={saveDestination.isPending}
        deletingDestination={deleteDestinationMutation.isPending}
        togglingDestinationId={
          patchDestinationEnabled.isPending ? (patchDestinationEnabled.variables?.id ?? null) : null
        }
        onRetentionChange={(retentionCount) => patchSettings.mutate({ retentionCount })}
        onDefaultDestinationChange={(defaultDestinationId) =>
          patchSettings.mutate({ defaultDestinationId })
        }
        onAutoToggle={(enabled) => {
          if (enabled) {
            openEnableAuto();
          } else {
            patchSchedule.mutate({ enabled: false });
          }
        }}
        onSaveDestination={async (form, destinationId) => {
          await saveDestination.mutateAsync({ form, destinationId });
        }}
        onDeleteDestination={(d) => deleteDestinationMutation.mutate(d.id)}
        onSetDefaultDestination={(destinationId) =>
          patchSettings.mutate({ defaultDestinationId: destinationId })
        }
        onToggleDestinationEnabled={(destinationId, enabled) => {
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
        onRestoreFromBackup={(backupRunId) => triggerRestore.mutate(backupRunId)}
        onRestoreUploadComplete={handleRestoreUploadComplete}
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
