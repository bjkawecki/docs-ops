import { useState } from 'react';
import { Badge, Button, Group, Loader, Popover, Stack, Table, Text } from '@mantine/core';
import { AdminBackupDeleteFailedModal } from './AdminBackupDeleteFailedModal';
import { AdminBackupDeleteLocalModal } from './AdminBackupDeleteLocalModal';
import { BACKUP_STATUS_COLOR, type BackupRun } from './adminBackupTypes';
import { formatExternalDestinationLabel } from './backupRunPolling';

type Props = {
  runs: BackupRun[] | undefined;
  loading: boolean;
  downloadLoading: boolean;
  deleteLocalLoading: boolean;
  deleteRunLoading: boolean;
  onDownload: (id: string) => void;
  onDeleteLocal: (id: string) => Promise<void>;
  onDeleteRun: (id: string) => Promise<void>;
};

export function AdminBackupHistorySection({
  runs,
  loading,
  downloadLoading,
  deleteLocalLoading,
  deleteRunLoading,
  onDownload,
  onDeleteLocal,
  onDeleteRun,
}: Props) {
  const items = runs ?? [];
  const [deleteLocalTarget, setDeleteLocalTarget] = useState<BackupRun | null>(null);
  const [deleteRunTarget, setDeleteRunTarget] = useState<BackupRun | null>(null);

  return (
    <>
      <Group mb="xs" justify="space-between">
        <Text size="sm" c="dimmed">
          {items.length} backup(s)
        </Text>
      </Group>
      <AdminBackupDeleteLocalModal
        run={deleteLocalTarget}
        opened={deleteLocalTarget != null}
        onClose={() => setDeleteLocalTarget(null)}
        loading={deleteLocalLoading}
        onConfirm={() => {
          if (!deleteLocalTarget) return;
          void onDeleteLocal(deleteLocalTarget.id).then(() => setDeleteLocalTarget(null));
        }}
      />
      <AdminBackupDeleteFailedModal
        opened={deleteRunTarget != null}
        onClose={() => setDeleteRunTarget(null)}
        loading={deleteRunLoading}
        onConfirm={() => {
          if (!deleteRunTarget) return;
          void onDeleteRun(deleteRunTarget.id).then(() => setDeleteRunTarget(null));
        }}
      />
      {loading ? (
        <Loader size="sm" />
      ) : (
        <Table withTableBorder withColumnBorders className="admin-table-hover">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Started</Table.Th>
              <Table.Th>Finished</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Trigger</Table.Th>
              <Table.Th>External destination</Table.Th>
              <Table.Th>Size</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text size="sm" c="dimmed">
                    No backups yet.
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              items.map((run) => (
                <Table.Tr key={run.id}>
                  <Table.Td>
                    <Text size="sm">{new Date(run.createdAt).toLocaleString()}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {run.finishedAt ? new Date(run.finishedAt).toLocaleString() : '–'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4}>
                      <Badge color={BACKUP_STATUS_COLOR[run.status] ?? 'gray'} variant="filled">
                        {run.status}
                      </Badge>
                      {run.status === 'failed' && run.errorMessage ? (
                        <Popover width={360} position="bottom-start" withArrow shadow="md">
                          <Popover.Target>
                            <Text
                              component="button"
                              type="button"
                              size="xs"
                              c="dimmed"
                              td="underline"
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              Show error message
                            </Text>
                          </Popover.Target>
                          <Popover.Dropdown>
                            <Text
                              size="sm"
                              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                            >
                              {run.errorMessage}
                            </Text>
                          </Popover.Dropdown>
                        </Popover>
                      ) : null}
                    </Stack>
                  </Table.Td>
                  <Table.Td>{run.triggerSource}</Table.Td>
                  <Table.Td>{formatExternalDestinationLabel(run)}</Table.Td>
                  <Table.Td>
                    {run.sizeBytes != null ? `${Math.round(run.sizeBytes / 1024)} KB` : '–'}
                  </Table.Td>
                  <Table.Td>
                    {run.status === 'succeeded' ? (
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        {run.localObjectKey ? (
                          <>
                            <Button
                              size="xs"
                              variant="filled"
                              onClick={() => onDownload(run.id)}
                              loading={downloadLoading}
                            >
                              Download
                            </Button>
                            <Button
                              size="xs"
                              variant="filled"
                              color="red"
                              onClick={() => setDeleteLocalTarget(run)}
                            >
                              Delete local
                            </Button>
                          </>
                        ) : (
                          <Text size="xs" c="dimmed">
                            {run.remotePath ? 'Local removed' : 'No local copy'}
                          </Text>
                        )}
                      </Group>
                    ) : run.status === 'failed' ? (
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        <Button
                          size="xs"
                          variant="filled"
                          color="red"
                          onClick={() => setDeleteRunTarget(run)}
                        >
                          Delete
                        </Button>
                      </Group>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}
