import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { DepartmentWithCompany } from './adminDepartmentsTabTypes';

export type AdminDepartmentDeleteModalProps = {
  opened: boolean;
  department: DepartmentWithCompany | null;
  onClose: () => void;
  onConfirmDelete: () => void;
  deleteLoading: boolean;
};

export function AdminDepartmentDeleteModal({
  opened,
  department,
  onClose,
  onConfirmDelete,
  deleteLoading,
}: AdminDepartmentDeleteModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Delete department" size="sm">
      {department && (
        <Stack>
          <Text size="sm">
            Really delete department &quot;{department.name}&quot;? Not possible when teams or
            dependencies exist.
          </Text>
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
