import { useRef, useState } from 'react';
import { Alert, Button, Group, Modal, Radio, Stack, Text, Tooltip } from '@mantine/core';
import { apiFetch } from '../../../api/client';
import type { BackupRun } from './adminBackupTypes';
import { formatBackupRunLabel, listRestorableBackups } from './backupRestoreHelpers';

type RestoreSource = 'history' | 'upload';

type Props = {
  backups: BackupRun[] | undefined;
  maintenanceActive: boolean;
  restoreFromBackupLoading: boolean;
  onClose: () => void;
  onRestoreFromBackup: (backupRunId: string) => void;
  onUploadComplete: (restoreRunId: string) => void;
};

export function AdminBackupRestorePanel({
  backups,
  maintenanceActive,
  restoreFromBackupLoading,
  onClose,
  onRestoreFromBackup,
  onUploadComplete,
}: Props) {
  const [source, setSource] = useState<RestoreSource>('history');
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const restorableBackups = listRestorableBackups(backups);
  const selectedBackup = restorableBackups.find((b) => b.id === selectedBackupId) ?? null;

  const handleSourceChange = (value: string) => {
    const next = value as RestoreSource;
    setSource(next);
    if (next === 'history') {
      setUploadOpen(false);
      setUploadError(null);
    } else {
      setSelectedBackupId(null);
      setConfirmOpen(false);
    }
  };

  const handleHistoryStart = () => {
    if (!selectedBackupId) return;
    setConfirmOpen(true);
  };

  const handleConfirmRestore = () => {
    if (!selectedBackupId) return;
    onRestoreFromBackup(selectedBackupId);
    setConfirmOpen(false);
  };

  const closeUpload = () => {
    setUploadOpen(false);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = async (file: File | null) => {
    if (!file) return;
    setUploadError(null);
    if (!file.name.endsWith('.tar.zst')) {
      setUploadError('Select a docsops-backup-*.tar.zst archive.');
      return;
    }
    setUploadLoading(true);
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      const res = await apiFetch('/api/v1/admin/restores/upload', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Upload failed');
      }
      const result = (await res.json()) as { restoreRunId: string };
      closeUpload();
      onUploadComplete(result.restoreRunId);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <Stack gap="md">
        <Alert color="red" title="Destructive operation" variant="filled">
          This replaces the entire database and MinIO objects. All users must sign in again after
          restore completes. Secrets from <code>.env</code> are not in the archive.
        </Alert>

        <Radio.Group label="Restore source" value={source} onChange={handleSourceChange}>
          <Group gap="lg" mt="xs" wrap="wrap">
            <Radio value="history" label="From backup history" />
            <Radio value="upload" label="Upload archive" />
          </Group>
        </Radio.Group>

        {source === 'history' ? (
          restorableBackups.length === 0 ? (
            <Text size="sm" c="dimmed">
              No backups with a local copy available. Choose upload archive or restore from external
              storage manually (see Runbook-Backup-Restore).
            </Text>
          ) : (
            <Radio.Group
              value={selectedBackupId}
              onChange={setSelectedBackupId}
              label="Select backup"
            >
              <Stack gap="xs" mt="xs">
                {restorableBackups.map((run) => (
                  <Radio key={run.id} value={run.id} label={formatBackupRunLabel(run)} />
                ))}
              </Stack>
            </Radio.Group>
          )
        ) : (
          <Text size="sm" c="dimmed">
            Upload <code>docsops-backup-*.tar.zst</code> copied from external storage.
          </Text>
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
          {source === 'history' ? (
            <Tooltip
              label={maintenanceActive ? 'Maintenance mode is active' : undefined}
              disabled={!maintenanceActive}
            >
              <Button
                color="red"
                disabled={!selectedBackupId || maintenanceActive}
                loading={restoreFromBackupLoading}
                onClick={handleHistoryStart}
              >
                Start restore
              </Button>
            </Tooltip>
          ) : (
            <Tooltip
              label={maintenanceActive ? 'Maintenance mode is active' : undefined}
              disabled={!maintenanceActive}
            >
              <Button color="red" disabled={maintenanceActive} onClick={() => setUploadOpen(true)}>
                Select archive and start restore
              </Button>
            </Tooltip>
          )}
        </Group>
      </Stack>

      <Modal
        opened={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Start restore?"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            This will replace the <strong>entire database</strong> and MinIO objects with{' '}
            <strong>
              {selectedBackup
                ? `backup from ${new Date(selectedBackup.createdAt).toLocaleString()}`
                : 'the selected backup'}
            </strong>
            . Existing data will be overwritten.
          </Text>
          <Text size="sm" c="dimmed">
            Write operations are blocked while restore runs.
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setConfirmOpen(false)}
              disabled={restoreFromBackupLoading}
            >
              Cancel
            </Button>
            <Button color="red" loading={restoreFromBackupLoading} onClick={handleConfirmRestore}>
              Start restore
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={uploadOpen} onClose={closeUpload} title="Upload backup archive" size="sm">
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Select a <code>docsops-backup-*.tar.zst</code> file from your computer.
          </Text>
          <input
            ref={fileInputRef}
            type="file"
            accept=".tar.zst,application/zstd"
            hidden
            onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
          />
          {uploadError ? (
            <Text size="sm" c="red">
              {uploadError}
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={closeUpload} disabled={uploadLoading}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={uploadLoading}
              onClick={() => fileInputRef.current?.click()}
            >
              Choose file
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
