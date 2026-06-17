import { useEffect, useState } from 'react';
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  Tooltip,
} from '@mantine/core';
import { Link } from 'react-router-dom';
import type { BackupRun, BackupStatus, Destination } from './adminBackupTypes';
import type { DestinationFormState } from './adminBackupDestinationForm';
import { formatBackupScheduleLabel } from './backupScheduleLabel';
import { AdminBackupDestinationsPanel } from './AdminBackupDestinationsPanel';
import { AdminBackupRestorePanel } from './AdminBackupRestorePanel';

export type BackupSettingsTab = 'general' | 'destinations' | 'restore';

type Props = {
  opened: boolean;
  onClose: () => void;
  initialTab?: BackupSettingsTab;
  status: BackupStatus;
  destinations: Destination[];
  backups: BackupRun[] | undefined;
  canEnableAuto: boolean;
  enableBlockReason: string | null;
  scheduleSaving: boolean;
  restoreFromBackupLoading: boolean;
  savingDestination: boolean;
  deletingDestination: boolean;
  togglingDestinationId: string | null;
  onRetentionChange: (value: number) => void;
  onDefaultDestinationChange: (value: string | null) => void;
  onAutoToggle: (enabled: boolean) => void;
  onSaveDestination: (form: DestinationFormState, destinationId: string | null) => Promise<void>;
  onDeleteDestination: (destination: Destination) => void;
  onSetDefaultDestination: (destinationId: string) => void;
  onToggleDestinationEnabled: (destinationId: string, enabled: boolean) => void;
  onRestoreFromBackup: (backupRunId: string) => void;
  onRestoreUploadComplete: (restoreRunId: string) => void;
};

export function AdminBackupSettingsModal({
  opened,
  onClose,
  initialTab = 'general',
  status,
  destinations,
  backups,
  canEnableAuto,
  enableBlockReason,
  scheduleSaving,
  restoreFromBackupLoading,
  savingDestination,
  deletingDestination,
  togglingDestinationId,
  onRetentionChange,
  onDefaultDestinationChange,
  onAutoToggle,
  onSaveDestination,
  onDeleteDestination,
  onSetDefaultDestination,
  onToggleDestinationEnabled,
  onRestoreFromBackup,
  onRestoreUploadComplete,
}: Props) {
  const [activeTab, setActiveTab] = useState<string | null>(initialTab);

  useEffect(() => {
    if (opened) {
      setActiveTab(initialTab);
    }
  }, [opened, initialTab]);

  const destinationOptions = destinations
    .filter((d) => d.enabled)
    .map((d) => ({ value: d.id, label: d.name }));

  const scheduleShortLabel = status.schedule.enabled
    ? formatBackupScheduleLabel(status.schedule.cron, status.schedule.tz)
    : 'Not scheduled';
  const scheduleDetail =
    status.schedule.enabled && status.schedule.cron
      ? `${status.schedule.cron} (${status.schedule.tz ?? 'UTC'})`
      : null;

  const handleRestoreFromBackup = (backupRunId: string) => {
    onRestoreFromBackup(backupRunId);
    onClose();
  };

  const handleRestoreUploadComplete = (restoreRunId: string) => {
    onRestoreUploadComplete(restoreRunId);
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Backup settings" size="lg">
      <Stack gap="md">
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="general">General</Tabs.Tab>
            <Tabs.Tab value="destinations">External destinations</Tabs.Tab>
            <Tabs.Tab value="restore">Disaster recovery</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="general" pt="md">
            <Stack gap="md">
              <NumberInput
                label="Keep successful backups"
                description="Number of succeeded backups to retain locally"
                min={1}
                max={365}
                value={status.retentionCount}
                onChange={(v) => {
                  if (typeof v === 'number') onRetentionChange(v);
                }}
              />

              <Select
                label="Default external destination"
                placeholder="None"
                data={destinationOptions}
                clearable
                value={status.defaultDestinationId}
                onChange={onDefaultDestinationChange}
              />

              <Group justify="space-between" align="flex-end">
                <Tooltip
                  label={enableBlockReason ?? ''}
                  disabled={!enableBlockReason || status.schedule.enabled}
                >
                  <Switch
                    label="Automatic backup"
                    description={scheduleDetail ?? scheduleShortLabel}
                    checked={status.schedule.enabled}
                    disabled={scheduleSaving || (!status.schedule.enabled && !canEnableAuto)}
                    onChange={(e) => onAutoToggle(e.currentTarget.checked)}
                  />
                </Tooltip>
                {status.autoBackupConfigured ? (
                  <Text size="xs" c="dimmed">
                    <Link to="/admin/scheduler">Scheduler</Link>
                  </Text>
                ) : null}
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="destinations" pt="md">
            <AdminBackupDestinationsPanel
              destinations={destinations}
              defaultDestinationId={status.defaultDestinationId}
              savingDestination={savingDestination}
              deletingDestination={deletingDestination}
              togglingDestinationId={togglingDestinationId}
              onSaveDestination={onSaveDestination}
              onDeleteDestination={onDeleteDestination}
              onSetDefault={onSetDefaultDestination}
              onToggleEnabled={onToggleDestinationEnabled}
            />
          </Tabs.Panel>

          <Tabs.Panel value="restore" pt="md">
            <AdminBackupRestorePanel
              backups={backups}
              maintenanceActive={status.maintenanceActive}
              restoreFromBackupLoading={restoreFromBackupLoading}
              onClose={onClose}
              onRestoreFromBackup={handleRestoreFromBackup}
              onUploadComplete={handleRestoreUploadComplete}
            />
          </Tabs.Panel>
        </Tabs>

        {activeTab !== 'restore' ? (
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Close
            </Button>
          </Group>
        ) : null}
      </Stack>
    </Modal>
  );
}
