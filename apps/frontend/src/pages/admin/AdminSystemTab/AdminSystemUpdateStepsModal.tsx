import {
  ActionIcon,
  Anchor,
  Button,
  Code,
  CopyButton,
  Group,
  Modal,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { Link } from 'react-router-dom';
import { IconCheck, IconCopy, IconExternalLink } from '@tabler/icons-react';

type Props = {
  opened: boolean;
  onClose: () => void;
  latestReleaseTag: string | null;
  releaseUrl: string | null;
  updaterConfigured?: boolean;
};

export function AdminSystemUpdateStepsModal({
  opened,
  onClose,
  latestReleaseTag,
  releaseUrl,
  updaterConfigured = false,
}: Props) {
  const updateTag = latestReleaseTag ?? 'vX.Y.Z';
  const updateCommand = `sudo /opt/docsops/scripts/update.sh ${updateTag}`;

  return (
    <Modal opened={opened} onClose={onClose} title="How to update (SSH)" size="md">
      <Stack gap="md">
        {updaterConfigured ? (
          <Text size="sm">
            For production, prefer <strong>Apply update</strong> on this tab (automatic backup, then
            upgrade). Use the steps below only for manual updates on the host.
          </Text>
        ) : (
          <Text size="sm">
            Updates run on the server via SSH. Create an operational backup in{' '}
            <Text component={Link} to="/admin/backup" fw={500}>
              Admin → Backup
            </Text>{' '}
            before upgrading.
          </Text>
        )}

        {updaterConfigured ? (
          <Text size="sm" c="dimmed">
            For a manual run, create a backup first in{' '}
            <Text component={Link} to="/admin/backup" fw={500}>
              Admin → Backup
            </Text>
            .
          </Text>
        ) : null}

        <Text size="sm">Run on the host:</Text>
        {latestReleaseTag == null && (
          <Text size="sm" c="dimmed">
            Replace <Code>vX.Y.Z</Code> with the target release tag from GitHub.
          </Text>
        )}
        <Group gap="xs" align="flex-start" wrap="nowrap">
          <Code block style={{ flex: 1 }}>
            {updateCommand}
          </Code>
          <CopyButton value={updateCommand} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied' : 'Copy command'} withArrow>
                <ActionIcon
                  variant="light"
                  size="lg"
                  aria-label={copied ? 'Copied' : 'Copy command'}
                  onClick={copy}
                >
                  {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>

        {releaseUrl != null && (
          <Anchor href={releaseUrl} target="_blank" rel="noreferrer" size="sm">
            <Group gap={4} component="span">
              View release on GitHub
              <IconExternalLink size={14} />
            </Group>
          </Anchor>
        )}

        <Group justify="flex-end">
          <Button onClick={onClose}>Close</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
