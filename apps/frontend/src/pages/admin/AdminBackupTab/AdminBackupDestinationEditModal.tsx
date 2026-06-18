import { Button, Group, Modal, Stack } from '@mantine/core';
import type { Destination } from './adminBackupTypes';
import type { DestinationFormState } from './adminBackupDestinationForm';
import {
  AdminBackupDestinationForm,
  BACKUP_DESTINATION_FORM_ID,
} from './AdminBackupDestinationForm';

type Props = {
  destination: Destination | null;
  opened: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (form: DestinationFormState, destinationId: string | null) => Promise<void>;
};

export function AdminBackupDestinationEditModal({
  destination,
  opened,
  saving,
  onClose,
  onSave,
}: Props) {
  const isEdit = destination != null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? `Edit ${destination.name}` : 'New external destination'}
      size="lg"
    >
      <Stack gap="md">
        <AdminBackupDestinationForm
          key={destination?.id ?? 'new'}
          destination={destination}
          onSave={(form, destinationId) => {
            void onSave(form, destinationId).then(() => {
              onClose();
            });
          }}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={BACKUP_DESTINATION_FORM_ID} loading={saving}>
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
