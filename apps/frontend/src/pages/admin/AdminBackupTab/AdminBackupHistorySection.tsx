import { useState } from 'react';
import { ActionIcon, Badge, Group, Loader, Menu, Popover, Stack, Table, Text } from '@mantine/core';
import { IconDotsVertical, IconDownload } from '@tabler/icons-react';
import { AdminBackupDeleteFailedModal } from './AdminBackupDeleteFailedModal';
import { AdminBackupDeleteModal } from './AdminBackupDeleteModal';
import { BACKUP_STATUS_COLOR, type BackupRun } from './adminBackupTypes';
import { formatExternalDestinationLabel } from './backupRunPolling';
import { isSupersededMaintenanceFailure } from './restoreRunPolling';

type Props = {
  runs: BackupRun[] | undefined;
  loading: boolean;
  downloadLoading: boolean;
  deleteBackupLoading: boolean;
  deleteRunLoading: boolean;
  onDownload: (id: string) => void;
  onDeleteBackup: (id: string) => Promise<void>;
  onDeleteRun: (id: string) => Promise<void>;
  onOpenDestinationSettings: () => void;
};

export function AdminBackupHistorySection({
  runs,
  loading,
  downloadLoading,
  deleteBackupLoading,
  deleteRunLoading,
  onDownload,
  onDeleteBackup,
  onDeleteRun,
  onOpenDestinationSettings,
}: Props) {
  const items = (runs ?? []).filter((run) => !isSupersededMaintenanceFailure(run));
  const [deleteTarget, setDeleteTarget] = useState<BackupRun | null>(null);
  const [deleteRunTarget, setDeleteRunTarget] = useState<BackupRun | null>(null);

  return (
    <>
      <Group mb="xs" justify="space-between">
        <Text size="sm" c="dimmed">
          {items.length} backup(s)
        </Text>
      </Group>
      <AdminBackupDeleteModal
        run={deleteTarget}
        opened={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        loading={deleteBackupLoading}
        onConfirm={() => {
          if (!deleteTarget) return;
          void onDeleteBackup(deleteTarget.id).then(() => setDeleteTarget(null));
        }}
      />
      <AdminBackupDeleteFailedModal
        opened={deleteRunTarget != null}
        runStatus={deleteRunTarget?.status}
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
        <Table
          withTableBorder
          withColumnBorders
          className="admin-table-hover admin-backup-history-table"
        >
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
                  <Table.Td>
                    {run.destination ? (
                      <Text
                        component="button"
                        type="button"
                        size="sm"
                        td="underline"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          textAlign: 'left',
                          color: 'inherit',
                        }}
                        onClick={onOpenDestinationSettings}
                      >
                        {formatExternalDestinationLabel(run)}
                      </Text>
                    ) : (
                      formatExternalDestinationLabel(run)
                    )}
                  </Table.Td>
                  <Table.Td>
                    {run.sizeBytes != null ? `${Math.round(run.sizeBytes / 1024)} KB` : '–'}
                  </Table.Td>
                  <Table.Td>
                    {run.status === 'succeeded' ? (
                      <Menu shadow="md" position="bottom-end">
                        <Menu.Target>
                          <ActionIcon variant="subtle" aria-label="Backup actions">
                            <IconDotsVertical size={18} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {run.localObjectKey ? (
                            <Menu.Item
                              leftSection={<IconDownload size={14} />}
                              disabled={downloadLoading}
                              onClick={() => onDownload(run.id)}
                            >
                              Download
                            </Menu.Item>
                          ) : null}
                          <Menu.Item color="red" onClick={() => setDeleteTarget(run)}>
                            Delete
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    ) : run.status === 'failed' ||
                      run.status === 'queued' ||
                      run.status === 'running' ||
                      run.status === 'uploading' ? (
                      <Menu shadow="md" position="bottom-end">
                        <Menu.Target>
                          <ActionIcon variant="subtle" aria-label="Backup actions">
                            <IconDotsVertical size={18} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item color="red" onClick={() => setDeleteRunTarget(run)}>
                            Remove from history
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
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
