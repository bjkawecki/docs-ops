import { useState } from 'react';
import { Alert, Button, Group, Stack, Switch, Table, Text } from '@mantine/core';
import type { Destination } from './adminBackupTypes';
import type { DestinationFormState } from './adminBackupDestinationForm';
import { AdminBackupDestinationEditModal } from './AdminBackupDestinationEditModal';
import { formatDestinationTypeShort } from './backupRunPolling';

type Props = {
  destinations: Destination[];
  defaultDestinationId: string | null;
  savingDestination: boolean;
  deletingDestination: boolean;
  togglingDestinationId: string | null;
  onSaveDestination: (form: DestinationFormState, destinationId: string | null) => Promise<void>;
  onDeleteDestination: (destination: Destination) => void;
  onSetDefault: (destinationId: string) => void;
  onToggleEnabled: (destinationId: string, enabled: boolean) => void;
};

export function AdminBackupDestinationsPanel({
  destinations,
  defaultDestinationId,
  savingDestination,
  deletingDestination,
  togglingDestinationId,
  onSaveDestination,
  onDeleteDestination,
  onSetDefault,
  onToggleEnabled,
}: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editDestination, setEditDestination] = useState<Destination | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Destination | null>(null);

  const openCreate = () => {
    setEditDestination(null);
    setFormOpen(true);
  };

  const openEdit = (destination: Destination) => {
    setEditDestination(destination);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditDestination(null);
  };

  return (
    <>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Text fw={600} size="sm">
            External destinations
          </Text>
          <Button size="xs" variant="default" onClick={openCreate}>
            Add destination
          </Button>
        </Group>

        {deleteTarget ? (
          <Alert color="red" title={`Delete external destination ${deleteTarget.name}?`}>
            <Group justify="space-between" align="center" wrap="wrap" gap="sm">
              <Text size="sm">This cannot be undone.</Text>
              <Group gap="xs">
                <Button size="xs" variant="default" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button
                  size="xs"
                  color="red"
                  loading={deletingDestination}
                  onClick={() => {
                    onDeleteDestination(deleteTarget);
                    setDeleteTarget(null);
                  }}
                >
                  Delete
                </Button>
              </Group>
            </Group>
          </Alert>
        ) : null}

        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Enabled</Table.Th>
              <Table.Th>Default</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {destinations.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text size="sm" c="dimmed">
                    No external destinations configured yet.
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              destinations.map((d) => (
                <Table.Tr key={d.id}>
                  <Table.Td>{d.name}</Table.Td>
                  <Table.Td>{formatDestinationTypeShort(d.type)}</Table.Td>
                  <Table.Td>
                    <Switch
                      size="sm"
                      aria-label={`Enable external destination ${d.name}`}
                      checked={d.enabled}
                      disabled={togglingDestinationId === d.id}
                      onChange={(e) => onToggleEnabled(d.id, e.currentTarget.checked)}
                    />
                  </Table.Td>
                  <Table.Td>
                    {defaultDestinationId === d.id ? (
                      <Text size="sm" fw={500}>
                        Default
                      </Text>
                    ) : (
                      '–'
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      {d.enabled && defaultDestinationId !== d.id ? (
                        <Button size="xs" variant="subtle" onClick={() => onSetDefault(d.id)}>
                          Set default
                        </Button>
                      ) : null}
                      <Button size="xs" variant="subtle" onClick={() => openEdit(d)}>
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => setDeleteTarget(d)}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Stack>

      <AdminBackupDestinationEditModal
        destination={editDestination}
        opened={formOpen}
        saving={savingDestination}
        onClose={closeForm}
        onSave={onSaveDestination}
      />
    </>
  );
}
