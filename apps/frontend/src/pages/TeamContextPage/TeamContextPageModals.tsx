import { Button, Group, Modal, Text } from '@mantine/core';
import { EditContextNameModal, NewContextModal, NewDocumentModal } from '../../components/contexts';
import type { DeleteTarget, EditTarget } from './teamContextPageTypes';

export type TeamContextPageModalsProps = {
  teamId: string;
  contextModalOpened: boolean;
  closeContextModal: () => void;
  documentModalOpened: boolean;
  closeDocumentModal: () => void;
  contextInitialType: 'process' | 'project' | undefined;
  onInvalidateContexts: () => void;
  editTarget: EditTarget | null;
  onCloseEdit: () => void;
  onEditSuccess: () => void;
  deleteTarget: DeleteTarget | null;
  onCloseDelete: () => void;
  deleteLoading: boolean;
  onDeleteConfirm: () => void;
};

export function TeamContextPageModals({
  teamId,
  contextModalOpened,
  closeContextModal,
  documentModalOpened,
  closeDocumentModal,
  contextInitialType,
  onInvalidateContexts,
  editTarget,
  onCloseEdit,
  onEditSuccess,
  deleteTarget,
  onCloseDelete,
  deleteLoading,
  onDeleteConfirm,
}: TeamContextPageModalsProps) {
  return (
    <>
      <NewContextModal
        opened={contextModalOpened}
        onClose={closeContextModal}
        scope={{ type: 'team', teamId }}
        onSuccess={onInvalidateContexts}
        initialType={contextInitialType}
      />
      <NewDocumentModal
        opened={documentModalOpened}
        onClose={closeDocumentModal}
        scope={{ type: 'team', teamId }}
        onSuccess={onInvalidateContexts}
      />

      {editTarget != null && (
        <EditContextNameModal
          opened
          onClose={onCloseEdit}
          type={editTarget.type}
          contextId={editTarget.id}
          currentName={editTarget.name}
          onSuccess={onEditSuccess}
        />
      )}

      <Modal opened={deleteTarget != null} onClose={onCloseDelete} title="Move to trash" centered>
        <Text size="sm" c="dimmed" mb="md">
          This context and its documents will be moved to trash. You can restore them from the Trash
          tab.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onCloseDelete}>
            Cancel
          </Button>
          <Button color="red" loading={deleteLoading} onClick={onDeleteConfirm}>
            Move to trash
          </Button>
        </Group>
      </Modal>
    </>
  );
}
