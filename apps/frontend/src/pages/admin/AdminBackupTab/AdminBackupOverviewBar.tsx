import { Badge, Button, Group, NumberInput, Select, Switch, Text, Tooltip } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import type { BackupStatus, Destination } from './adminBackupTypes';
import { formatBackupScheduleLabel } from './backupScheduleLabel';

type Props = {
  status: BackupStatus;
  destinations: Destination[];
  activeJobStatus: string | null;
  canBackup: boolean;
  canEnableAuto: boolean;
  enableBlockReason: string | null;
  scheduleSaving: boolean;
  backupLoading: boolean;
  onRetentionChange: (value: number) => void;
  onDefaultDestinationChange: (value: string | null) => void;
  onAutoToggle: (enabled: boolean) => void;
  onOpenSettings: () => void;
  onBackupNow: () => void;
};

export function AdminBackupOverviewBar({
  status,
  destinations,
  activeJobStatus,
  canBackup,
  canEnableAuto,
  enableBlockReason,
  scheduleSaving,
  backupLoading,
  onRetentionChange,
  onDefaultDestinationChange,
  onAutoToggle,
  onOpenSettings,
  onBackupNow,
}: Props) {
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

  return (
    <Group mb="md" justify="space-between" wrap="wrap" gap="sm" align="center">
      <Group gap="sm" wrap="wrap" align="center">
        <Badge color={status.minioAvailable ? 'green' : 'red'} variant="filled">
          MinIO {status.minioAvailable ? 'OK' : 'unavailable'}
        </Badge>
        <Badge color={status.workerConnected ? 'green' : 'yellow'} variant="filled">
          Job worker {status.workerConnected ? 'OK' : 'disconnected'}
        </Badge>

        <Tooltip label="Successful backups to keep">
          <NumberInput
            size="xs"
            aria-label="Retention"
            placeholder="Retention"
            min={1}
            max={365}
            value={status.retentionCount}
            onChange={(v) => {
              if (typeof v === 'number') onRetentionChange(v);
            }}
            style={{ width: 88 }}
          />
        </Tooltip>

        <Select
          size="xs"
          placeholder="Default external destination"
          aria-label="Default external destination"
          data={destinationOptions}
          clearable
          value={status.defaultDestinationId}
          onChange={onDefaultDestinationChange}
          style={{ width: 180 }}
        />

        <Tooltip
          label={enableBlockReason ?? ''}
          disabled={!enableBlockReason || status.schedule.enabled}
        >
          <Switch
            size="sm"
            label="Auto"
            checked={status.schedule.enabled}
            disabled={scheduleSaving || (!status.schedule.enabled && !canEnableAuto)}
            onChange={(e) => onAutoToggle(e.currentTarget.checked)}
          />
        </Tooltip>

        <Tooltip label={scheduleDetail ?? undefined} disabled={!scheduleDetail}>
          <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {scheduleShortLabel}
            {status.autoBackupConfigured ? (
              <>
                {' · '}
                <Link to="/admin/scheduler">Scheduler</Link>
              </>
            ) : null}
          </Text>
        </Tooltip>

        {activeJobStatus ? (
          <Text size="sm" c={status.maintenanceReason === 'restore' ? 'orange' : 'blue'}>
            {activeJobStatus}
          </Text>
        ) : null}
      </Group>

      <Group gap="sm" align="center" wrap="nowrap">
        <Button
          size="xs"
          variant="default"
          leftSection={<IconSettings size={14} />}
          onClick={onOpenSettings}
        >
          Settings
        </Button>
        <Button size="xs" onClick={onBackupNow} loading={backupLoading} disabled={!canBackup}>
          Backup now
        </Button>
      </Group>
    </Group>
  );
}
