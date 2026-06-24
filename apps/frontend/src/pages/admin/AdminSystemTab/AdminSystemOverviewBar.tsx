import { Anchor, Badge, Button, Group, Switch, Text, Tooltip } from '@mantine/core';
import { IconExternalLink, IconRefresh } from '@tabler/icons-react';
import type { AdminSystemUpdateStatus } from 'backend/api-types';

type Props = {
  status: AdminSystemUpdateStatus;
  checksEnabled: boolean;
  settingsSaving: boolean;
  checkLoading: boolean;
  statusLoading: boolean;
  onToggleChecks: (enabled: boolean) => void;
  onCheckNow: () => void;
  onViewSteps: () => void;
};

function formatCheckedAt(iso: string | null): string | null {
  if (iso == null) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

function statusBadge(status: AdminSystemUpdateStatus) {
  if (!status.updateCheckEnabled) {
    return (
      <Badge color="gray" variant="filled">
        Checks off
      </Badge>
    );
  }
  if (status.checkError) {
    return (
      <Badge color="yellow" variant="filled">
        Check failed
      </Badge>
    );
  }
  if (status.updateAvailable) {
    return (
      <Badge color="orange" variant="filled">
        Update available
      </Badge>
    );
  }
  return (
    <Badge color="green" variant="filled">
      Up to date
    </Badge>
  );
}

export function AdminSystemOverviewBar({
  status,
  checksEnabled,
  settingsSaving,
  checkLoading,
  statusLoading,
  onToggleChecks,
  onCheckNow,
  onViewSteps,
}: Props) {
  const lastChecked = formatCheckedAt(status.checkedAt);
  const checkDisabled = statusLoading || !checksEnabled || checkLoading;

  return (
    <Group mb="md" justify="space-between" wrap="wrap" gap="sm" align="center">
      <Group gap="sm" wrap="wrap" align="center">
        {statusBadge(status)}
        <Switch
          size="sm"
          label="Automatic checks"
          checked={checksEnabled}
          disabled={settingsSaving}
          onChange={(event) => onToggleChecks(event.currentTarget.checked)}
        />
        {lastChecked != null ? (
          <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            Last checked {lastChecked}
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            Not checked yet
          </Text>
        )}
      </Group>

      <Group gap="sm" align="center" wrap="nowrap">
        {status.releaseUrl != null && (
          <Anchor href={status.releaseUrl} target="_blank" rel="noreferrer" size="sm">
            <Group gap={4} component="span">
              GitHub release
              <IconExternalLink size={14} />
            </Group>
          </Anchor>
        )}
        <Button size="xs" variant="default" onClick={onViewSteps}>
          How to update
        </Button>
        <Tooltip
          label={!checksEnabled ? 'Enable automatic checks first' : undefined}
          disabled={checksEnabled}
        >
          <Button
            size="xs"
            leftSection={<IconRefresh size={14} />}
            loading={checkLoading}
            disabled={checkDisabled}
            onClick={onCheckNow}
          >
            Check for updates
          </Button>
        </Tooltip>
      </Group>
    </Group>
  );
}
