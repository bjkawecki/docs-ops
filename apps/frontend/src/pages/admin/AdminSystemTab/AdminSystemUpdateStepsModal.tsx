import {
  Anchor,
  Button,
  Checkbox,
  Code,
  CopyButton,
  Group,
  Modal,
  Stack,
  Text,
} from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconCheck, IconCopy, IconExternalLink } from '@tabler/icons-react';

type Props = {
  opened: boolean;
  onClose: () => void;
  latestReleaseTag: string | null;
  releaseUrl: string | null;
};

export function AdminSystemUpdateStepsModal({
  opened,
  onClose,
  latestReleaseTag,
  releaseUrl,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const updateTag = latestReleaseTag ?? 'vX.Y.Z';
  const updateCommand = `sudo /opt/docsops/scripts/update.sh ${updateTag}`;

  const handleClose = () => {
    setStep(1);
    setBackupConfirmed(false);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={step === 1 ? 'Before you update' : 'Update on the server'}
      size="md"
    >
      {step === 1 ? (
        <Stack gap="md">
          <Text size="sm">
            Create an operational backup before upgrading production. Updates are applied on the
            server via SSH — not from this web interface.
          </Text>
          <Text size="sm">
            <Text component={Link} to="/admin/backup" fw={500}>
              Open Backup tab
            </Text>{' '}
            to create or verify a backup.
          </Text>
          <Checkbox
            checked={backupConfirmed}
            onChange={(event) => setBackupConfirmed(event.currentTarget.checked)}
            label="I confirm a current backup exists"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              Cancel
            </Button>
            <Button disabled={!backupConfirmed} onClick={() => setStep(2)}>
              Continue
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="md">
          <Text size="sm">Run this command on the host (SSH):</Text>
          {latestReleaseTag == null && (
            <Text size="sm" c="dimmed">
              Replace <Code>vX.Y.Z</Code> with the target release tag from GitHub.
            </Text>
          )}
          <Group gap="xs" align="flex-start" wrap="nowrap">
            <Code block style={{ flex: 1 }}>
              {updateCommand}
            </Code>
            <CopyButton value={updateCommand}>
              {({ copied, copy }) => (
                <Button
                  variant="light"
                  size="compact-sm"
                  leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  onClick={copy}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
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
            <Button onClick={handleClose}>Close</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
