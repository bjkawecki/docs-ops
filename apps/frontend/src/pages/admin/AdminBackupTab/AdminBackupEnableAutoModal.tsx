import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';

type Props = {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
};

export function AdminBackupEnableAutoModal({ opened, onClose, onConfirm, loading }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Enable automatic backups" size="sm">
      <Stack gap="md">
        <Text size="sm">
          Enable daily backups at <strong>03:00 UTC</strong>? The default external destination from
          this tab will be used. You can change the schedule later in{' '}
          <Link to="/admin/scheduler">Scheduler</Link> (job: <code>maintenance.backup</code>).
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={loading} onClick={onConfirm}>
            Enable
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
