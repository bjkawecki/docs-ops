import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { TeamWithDept } from './adminTeamsTabTypes';

export type AdminTeamDeleteModalProps = {
  opened: boolean;
  team: TeamWithDept | null;
  onClose: () => void;
  onConfirmDelete: () => void;
  deleteLoading: boolean;
};

export function AdminTeamDeleteModal({
  opened,
  team,
  onClose,
  onConfirmDelete,
  deleteLoading,
}: AdminTeamDeleteModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Delete team" size="sm">
      {team && (
        <Stack>
          <Text size="sm">Really delete team &quot;{team.name}&quot;? This cannot be undone.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button color="red" onClick={onConfirmDelete} loading={deleteLoading}>
              Delete
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
