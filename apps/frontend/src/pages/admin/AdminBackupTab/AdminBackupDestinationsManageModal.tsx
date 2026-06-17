import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Switch, Table, Tabs, Text } from '@mantine/core';
import type { Destination } from './adminBackupTypes';
import type { DestinationFormState } from './adminBackupDestinationForm';
import {
  AdminBackupDestinationForm,
  BACKUP_DESTINATION_FORM_ID,
} from './AdminBackupDestinationForm';
import { formatDestinationTypeShort } from './backupRunPolling';

type Props = {
  opened: boolean;
  onClose: () => void;
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

export function AdminBackupDestinationsManageModal({
  opened,
  onClose,
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
  const [activeTab, setActiveTab] = useState<string | null>('list');
  const [editDestination, setEditDestination] = useState<Destination | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Destination | null>(null);

  useEffect(() => {
    if (opened) {
      setActiveTab('list');
      setEditDestination(null);
      setDeleteTarget(null);
    }
  }, [opened]);

  const openEdit = (destination: Destination) => {
    setEditDestination(destination);
    setActiveTab('form');
  };

  const formTabLabel = editDestination
    ? `Edit: ${editDestination.name}`
    : 'New external destination';

  return (
    <Modal opened={opened} onClose={onClose} title="Manage external destinations" size="lg">
      <Stack gap="md">
        <Tabs
          value={activeTab}
          onChange={(value) => {
            setActiveTab(value);
            if (value === 'list') {
              setEditDestination(null);
            }
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="list">External destinations</Tabs.Tab>
            <Tabs.Tab
              value="form"
              onClick={() => {
                if (activeTab !== 'form') {
                  setEditDestination(null);
                }
              }}
            >
              {formTabLabel}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="list" pt="md">
            <Stack gap="md">
              {deleteTarget && (
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
              )}

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
                            {d.enabled && defaultDestinationId !== d.id && (
                              <Button size="xs" variant="subtle" onClick={() => onSetDefault(d.id)}>
                                Set default
                              </Button>
                            )}
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
          </Tabs.Panel>

          <Tabs.Panel value="form" pt="md">
            <AdminBackupDestinationForm
              key={editDestination?.id ?? 'new'}
              destination={editDestination}
              onSave={(form, destinationId) => {
                void onSaveDestination(form, destinationId).then(() => {
                  setActiveTab('list');
                  setEditDestination(null);
                });
              }}
            />
          </Tabs.Panel>
        </Tabs>

        <Group justify="space-between" mt="md">
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
          {activeTab === 'form' ? (
            <Button type="submit" form={BACKUP_DESTINATION_FORM_ID} loading={savingDestination}>
              {editDestination ? 'Save' : 'Create external destination'}
            </Button>
          ) : null}
        </Group>
      </Stack>
    </Modal>
  );
}
