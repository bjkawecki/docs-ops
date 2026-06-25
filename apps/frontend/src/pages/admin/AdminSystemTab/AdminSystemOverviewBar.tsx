import { Anchor, Badge, Button, Group, Popover, Switch, Text, Tooltip } from '@mantine/core';
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
  onApplyUpdate?: () => void;
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
      <Popover width={360} position="bottom-start" withArrow shadow="md">
        <Popover.Target>
          <Badge
            color="red"
            variant="filled"
            style={{ cursor: 'pointer' }}
            role="button"
            tabIndex={0}
          >
            Check failed
          </Badge>
        </Popover.Target>
        <Popover.Dropdown>
          <Text size="sm" fw={600} mb={4}>
            Update check failed
          </Text>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {status.checkError}
          </Text>
        </Popover.Dropdown>
      </Popover>
    );
  }
  if (status.updateAvailable) {
    return null;
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
  onApplyUpdate,
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
        {status.canApplyUpdate && onApplyUpdate != null ? (
          <Button size="xs" color="orange" onClick={onApplyUpdate}>
            Apply update
          </Button>
        ) : null}
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
