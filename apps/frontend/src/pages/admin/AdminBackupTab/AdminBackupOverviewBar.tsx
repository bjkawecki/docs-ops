import { Badge, Button, Group, NumberInput, Select, Switch, Text, Tooltip } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { BackupStatus, Destination } from './adminBackupTypes';

type Props = {
  status: BackupStatus;
  destinations: Destination[];
  retentionCount: number;
  onRetentionChange: (value: number) => void;
  onDefaultDestinationChange: (value: string | null) => void;
  canBackup: boolean;
  canEnableAuto: boolean;
  enableBlockReason: string | null;
  scheduleSaving: boolean;
  backupLoading: boolean;
  onAutoToggle: (enabled: boolean) => void;
  onManageDestinations: () => void;
  onBackupNow: () => void;
};

export function AdminBackupOverviewBar({
  status,
  destinations,
  retentionCount,
  onRetentionChange,
  onDefaultDestinationChange,
  canBackup,
  canEnableAuto,
  enableBlockReason,
  scheduleSaving,
  backupLoading,
  onAutoToggle,
  onManageDestinations,
  onBackupNow,
}: Props) {
  const destinationOptions = destinations
    .filter((d) => d.enabled)
    .map((d) => ({ value: d.id, label: d.name }));

  const scheduleShortLabel = status.schedule.enabled ? 'Daily at 03:00 UTC' : 'Not scheduled';
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
        {status.maintenanceActive && (
          <Badge color="blue" variant="filled">
            Maintenance
          </Badge>
        )}

        <Tooltip label="Successful backups to keep">
          <NumberInput
            size="xs"
            aria-label="Retention"
            placeholder="Retention"
            min={1}
            max={365}
            value={retentionCount}
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
            {status.autoBackupConfigured && (
              <>
                {' · '}
                <Link to="/admin/scheduler">Scheduler</Link>
              </>
            )}
          </Text>
        </Tooltip>
      </Group>

      <Group gap="sm" align="center" wrap="nowrap">
        <Button size="xs" variant="default" onClick={onManageDestinations}>
          Manage external destinations
        </Button>
        <Button size="xs" onClick={onBackupNow} loading={backupLoading} disabled={!canBackup}>
          Backup now
        </Button>
      </Group>
    </Group>
  );
}
