import { useState } from 'react';
import { Alert, Badge, Button, Group, Loader, Popover, Stack, Table, Text } from '@mantine/core';
import { BACKUP_STATUS_COLOR, type BackupRun } from './adminBackupTypes';
import { formatExternalDestinationLabel } from './backupRunPolling';

type Props = {
  runs: BackupRun[] | undefined;
  loading: boolean;
  downloadLoading: boolean;
  deleteLocalLoading: boolean;
  onDownload: (id: string) => void;
  onDeleteLocal: (id: string) => void;
};

function deleteLocalConfirmMessage(run: BackupRun): string {
  if (run.remotePath) {
    return 'Remove the local copy from object storage? The archive on the external destination is kept.';
  }
  return 'Remove the local copy? There is no external copy — this backup will no longer be downloadable from DocsOps.';
}

export function AdminBackupHistorySection({
  runs,
  loading,
  downloadLoading,
  deleteLocalLoading,
  onDownload,
  onDeleteLocal,
}: Props) {
  const items = runs ?? [];
  const [deleteLocalTarget, setDeleteLocalTarget] = useState<BackupRun | null>(null);

  return (
    <>
      <Group mb="xs" justify="space-between">
        <Text size="sm" c="dimmed">
          {items.length} backup(s)
        </Text>
      </Group>
      {deleteLocalTarget ? (
        <Alert color="red" title="Delete local copy?" mb="sm">
          <Stack gap="sm">
            <Text size="sm">{deleteLocalConfirmMessage(deleteLocalTarget)}</Text>
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={() => setDeleteLocalTarget(null)}>
                Cancel
              </Button>
              <Button
                size="xs"
                color="red"
                loading={deleteLocalLoading}
                onClick={() => {
                  onDeleteLocal(deleteLocalTarget.id);
                  setDeleteLocalTarget(null);
                }}
              >
                Delete local copy
              </Button>
            </Group>
          </Stack>
        </Alert>
      ) : null}
      {loading ? (
        <Loader size="sm" />
      ) : (
        <Table withTableBorder withColumnBorders className="admin-table-hover">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Started</Table.Th>
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
                <Table.Td colSpan={6}>
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
                    <Stack gap={4}>
                      <Badge color={BACKUP_STATUS_COLOR[run.status] ?? 'gray'} variant="light">
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
                              variant="light"
                              onClick={() => onDownload(run.id)}
                              loading={downloadLoading}
                            >
                              Download
                            </Button>
                            <Button
                              size="xs"
                              variant="subtle"
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
