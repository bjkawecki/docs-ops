import { Alert, Button, Code, Group, Modal, ScrollArea, Stack, Stepper, Text } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import type { AdminSystemUpdateStatus, AdminUpdateRun } from 'backend/api-types';
import { useApplySystemUpdate, usePollUpdateRun } from '../../../hooks/useAdminUpdateStatus.js';
import {
  UPDATE_PROGRESS_STEPS,
  updateProgressStepIndex,
  agentPhaseStepIndex,
  formatElapsedSince,
} from './updateProgressSteps.js';

type Props = {
  opened: boolean;
  onClose: () => void;
  status: AdminSystemUpdateStatus;
};

function resolveActiveRun(
  status: AdminSystemUpdateStatus,
  polledRun: AdminUpdateRun | undefined
): AdminUpdateRun | null {
  if (polledRun != null) return polledRun;
  return status.activeUpdateRun;
}

export function AdminSystemApplyUpdateModal({ opened, onClose, status }: Props) {
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const [trackingRunId, setTrackingRunId] = useState<string | null>(null);
  const applyMutation = useApplySystemUpdate();

  const pollQuery = usePollUpdateRun(trackingRunId, {
    enabled: opened && trackingRunId != null,
  });

  const activeRun = resolveActiveRun(status, pollQuery.data);
  const inProgress =
    activeRun != null &&
    (activeRun.status === 'queued' ||
      activeRun.status === 'backing_up' ||
      activeRun.status === 'applying');

  useEffect(() => {
    if (!opened) {
      setFailedMessage(null);
      setTrackingRunId(null);
    }
  }, [opened]);

  useEffect(() => {
    if (opened && status.activeUpdateRun?.id) {
      setTrackingRunId(status.activeUpdateRun.id);
    }
  }, [opened, status.activeUpdateRun?.id]);

  useEffect(() => {
    if (activeRun?.status === 'failed' && activeRun.errorMessage) {
      setFailedMessage(activeRun.errorMessage);
    }
  }, [activeRun?.status, activeRun?.errorMessage]);

  const stepIndex = useMemo(() => {
    if (activeRun == null) return -1;
    if (activeRun.status === 'applying' && activeRun.agentPhase) {
      return agentPhaseStepIndex(activeRun.agentPhase);
    }
    return updateProgressStepIndex(activeRun.status);
  }, [activeRun]);

  const elapsed = formatElapsedSince(activeRun?.startedAt ?? null, Date.now());

  const handleClose = () => {
    if (applyMutation.isPending || inProgress) return;
    onClose();
  };

  const handleApply = async () => {
    try {
      const result = await applyMutation.mutateAsync();
      setTrackingRunId(result.updateRunId);
      setFailedMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start update.';
      setFailedMessage(message);
    }
  };

  const tag = status.latestReleaseTag ?? 'vX.Y.Z';
  const showRunFailure = failedMessage != null && !inProgress;
  const showProgress = inProgress && activeRun != null;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={showRunFailure ? 'Update failed' : showProgress ? 'Updating DocsOps' : 'Apply update'}
      size="md"
      closeOnClickOutside={!applyMutation.isPending && !inProgress}
      closeOnEscape={!applyMutation.isPending && !inProgress}
    >
      {showRunFailure ? (
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
      ) : showProgress ? (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Upgrading to <strong>{activeRun.targetReleaseTag}</strong>
            {elapsed != null ? ` · ${elapsed}` : ''}
          </Text>
          <Stepper active={Math.max(0, stepIndex)} size="sm" orientation="vertical">
            {UPDATE_PROGRESS_STEPS.map((step) => (
              <Stepper.Step key={step.key} label={step.label} description={step.detail} />
            ))}
          </Stepper>
          {activeRun.agentPhase ? (
            <Text size="xs" c="dimmed">
              Current step: <Code>{activeRun.agentPhase}</Code>
            </Text>
          ) : null}
          <Text size="sm" c="dimmed">
            You can keep this dialog open. Reload the page after the stack restarts if the UI does
            not recover automatically.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Run in background
            </Button>
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
