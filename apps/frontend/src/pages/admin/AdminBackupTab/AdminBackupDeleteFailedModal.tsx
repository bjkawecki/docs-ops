import { Button, Group, Modal, Stack, Text } from '@mantine/core';

type Props = {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
};

export function AdminBackupDeleteFailedModal({ opened, onClose, onConfirm, loading }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Delete failed backup?" size="sm">
      <Stack gap="md">
        <Text size="sm">Remove this failed backup run from history? This cannot be undone.</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button color="red" loading={loading} onClick={onConfirm}>
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
