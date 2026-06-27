import { Alert, Button, Code, Group, Modal, ScrollArea, Stack, Stepper, Text } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import type { AdminSystemUpdateStatus, AdminUpdateRun } from 'backend/api-types';
import { useApplySystemUpdate, usePollUpdateRun } from '../../../hooks/useAdminUpdateStatus.js';
import { useUpdateAutoReload } from '../../../hooks/useUpdateAutoReload.js';
import {
  UPDATE_PROGRESS_STEPS,
  updateProgressStepIndex,
  agentPhaseStepIndex,
  formatElapsedSince,
  formatAgentPhaseLabel,
  isRestartPhase,
} from './updateProgressSteps.js';
import { openUpdateStatusPage } from './updateStatusPageUrl.js';

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
  const [dismissedSuccessRunId, setDismissedSuccessRunId] = useState<string | null>(null);
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

  const showSuccess =
    activeRun?.status === 'succeeded' &&
    trackingRunId != null &&
    activeRun.id === trackingRunId &&
    dismissedSuccessRunId !== trackingRunId;

  const autoReload = useUpdateAutoReload({ enabled: opened && showSuccess });

  useEffect(() => {
    if (!opened) {
      setFailedMessage(null);
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
    if (activeRun.status === 'succeeded') {
      return UPDATE_PROGRESS_STEPS.length;
    }
    if (activeRun.status === 'applying' && activeRun.agentPhase) {
      return agentPhaseStepIndex(activeRun.agentPhase);
    }
    return updateProgressStepIndex(activeRun.status);
  }, [activeRun]);

  const elapsed = formatElapsedSince(activeRun?.startedAt ?? null, Date.now());
  const agentPhaseLabel = formatAgentPhaseLabel(activeRun?.agentPhase);
  const showRestartAlert =
    inProgress &&
    (isRestartPhase(activeRun?.agentPhase) || (pollQuery.isError && trackingRunId != null));

  const handleDismissSuccess = () => {
    if (trackingRunId != null) {
      setDismissedSuccessRunId(trackingRunId);
    }
    onClose();
  };

  const handleClose = () => {
    if (applyMutation.isPending || inProgress) return;
    if (showSuccess) {
      handleDismissSuccess();
      return;
    }
    onClose();
  };

  const handleApply = async () => {
    try {
      const result = await applyMutation.mutateAsync();
      setTrackingRunId(result.updateRunId);
      setDismissedSuccessRunId(null);
      setFailedMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start update.';
      setFailedMessage(message);
    }
  };

  const tag = status.latestReleaseTag ?? 'vX.Y.Z';
  const showRunFailure = failedMessage != null && !inProgress && !showSuccess;
  const showProgress = inProgress && activeRun != null;

  const modalTitle = showRunFailure
    ? 'Update failed'
    : showSuccess
      ? 'Update completed'
      : showProgress
        ? 'Updating DocsOps'
        : 'Apply update';

  const reloadCountdownText =
    autoReload.secondsLeft != null ? ` Reloading in ${autoReload.secondsLeft}…` : ' Reloading…';

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={modalTitle}
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
      ) : showSuccess && activeRun != null ? (
        <Stack gap="md">
          <Alert color="green" title="Update completed">
            DocsOps has been upgraded to <strong>{activeRun.targetReleaseTag}</strong>.
            {reloadCountdownText}
          </Alert>
          <Stepper active={UPDATE_PROGRESS_STEPS.length} size="sm" orientation="vertical">
            {UPDATE_PROGRESS_STEPS.map((step) => (
              <Stepper.Step key={step.key} label={step.label} description={step.detail} />
            ))}
            <Stepper.Completed>All steps finished.</Stepper.Completed>
          </Stepper>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => openUpdateStatusPage(activeRun.targetReleaseTag)}
            >
              Open status page
            </Button>
            <Button variant="default" onClick={handleDismissSuccess}>
              Close
            </Button>
          </Group>
        </Stack>
      ) : showProgress ? (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Upgrading to <strong>{activeRun.targetReleaseTag}</strong>
            {elapsed != null ? ` · ${elapsed}` : ''}
          </Text>
          {showRestartAlert ? (
            <Alert color="yellow" title="Services are restarting">
              The page may not respond for a while. This is expected, not a failure.
            </Alert>
          ) : null}
          <Stepper active={Math.max(0, stepIndex)} size="sm" orientation="vertical">
            {UPDATE_PROGRESS_STEPS.map((step, index) => (
              <Stepper.Step
                key={step.key}
                label={step.label}
                description={step.detail}
                loading={index === stepIndex && inProgress}
              />
            ))}
          </Stepper>
          {agentPhaseLabel ? (
            <Text size="xs" c="dimmed">
              Current step: {agentPhaseLabel}
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => openUpdateStatusPage(activeRun.targetReleaseTag)}
            >
              Open status page
            </Button>
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
