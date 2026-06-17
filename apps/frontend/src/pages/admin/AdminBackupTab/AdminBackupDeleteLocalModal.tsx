import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { BackupRun } from './adminBackupTypes';

type Props = {
  run: BackupRun | null;
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
};

function deleteLocalConfirmMessage(run: BackupRun): string {
  if (run.remotePath) {
    return 'Remove the local copy from object storage? The archive on the external destination is kept.';
  }
  return 'Remove the local copy? There is no external copy — this backup will no longer be downloadable from DocsOps.';
}

export function AdminBackupDeleteLocalModal({ run, opened, onClose, onConfirm, loading }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Delete local copy?" size="sm">
      <Stack gap="md">
        <Text size="sm">{run ? deleteLocalConfirmMessage(run) : ''}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button color="red" loading={loading} onClick={onConfirm}>
            Delete local copy
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
