import { Alert, Button, Code, Group, Modal, ScrollArea, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { AdminSystemUpdateStatus } from 'backend/api-types';
import { useApplySystemUpdate } from '../../../hooks/useAdminUpdateStatus.js';
import { UPDATE_PROGRESS_STEPS } from './updateProgressSteps.js';

type Props = {
  opened: boolean;
  onClose: () => void;
  status: AdminSystemUpdateStatus;
};

export function AdminSystemApplyUpdateModal({ opened, onClose, status }: Props) {
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const applyMutation = useApplySystemUpdate();

  useEffect(() => {
    if (!opened) {
      setFailedMessage(null);
    }
  }, [opened]);

  useEffect(() => {
    const run = status.activeUpdateRun;
    if (!opened || run == null) return;

    if (run.status === 'queued' || run.status === 'backing_up' || run.status === 'applying') {
      onClose();
    }
  }, [opened, onClose, status.activeUpdateRun]);

  const handleClose = () => {
    if (applyMutation.isPending) return;
    onClose();
  };

  const handleApply = async () => {
    try {
      await applyMutation.mutateAsync();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start update.';
      setFailedMessage(message);
    }
  };

  const tag = status.latestReleaseTag ?? 'vX.Y.Z';
  const showFailure = failedMessage != null;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={showFailure ? 'Update failed' : 'Apply update'}
      size="md"
      closeOnClickOutside={!applyMutation.isPending}
      closeOnEscape={!applyMutation.isPending}
    >
      {showFailure ? (
        <Stack gap="md">
          <Alert color="red" title="Update failed">
            <ScrollArea.Autosize mah={280}>
              <Code block style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {failedMessage}
              </Code>
            </ScrollArea.Autosize>
          </Alert>
          <Group justify="flex-end">
            <Button onClick={handleClose}>Close</Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="md">
          <Text size="sm">
            A backup will be created automatically, then DocsOps will upgrade to{' '}
            <strong>{tag}</strong>. Write operations are blocked during the update.
          </Text>
          <Stack gap={4}>
            {UPDATE_PROGRESS_STEPS.map((step) => (
              <Text key={step.key} size="sm" c="dimmed">
                • {step.label}
              </Text>
            ))}
          </Stack>
          <Text size="sm" c="dimmed">
            Progress appears in the banner at the top of the page. You may need to reload after
            containers restart.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              Cancel
            </Button>
            <Button loading={applyMutation.isPending} onClick={() => void handleApply()}>
              Start update
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
