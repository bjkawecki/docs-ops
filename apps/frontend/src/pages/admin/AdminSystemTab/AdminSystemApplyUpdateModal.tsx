import {
  Alert,
  Button,
  Code,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Stepper,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import type { AdminSystemUpdateStatus, AdminUpdateRun } from 'backend/api-types';
import { useApplySystemUpdate, usePollUpdateRun } from '../../../hooks/useAdminUpdateStatus.js';
import { useUpdateAutoReload } from '../../../hooks/useUpdateAutoReload.js';
import {
  UPDATE_PROGRESS_STEPS,
  updateProgressStepIndex,
  agentPhaseStepIndex,
  formatElapsedSince,
  isRestartPhase,
} from './updateProgressSteps.js';
import { updateStatusPageUrl, openUpdateStatusPage } from './updateStatusPageUrl.js';

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

  const showProgress = inProgress && activeRun != null;

  const isRestarting =
    showProgress &&
    (isRestartPhase(activeRun?.agentPhase) || (pollQuery.isError && trackingRunId != null));

  const statusPageUrl = useMemo(
    () =>
      activeRun?.targetReleaseTag != null ? updateStatusPageUrl(activeRun.targetReleaseTag) : null,
    [activeRun?.targetReleaseTag]
  );

  const restartRedirect = useUpdateAutoReload({
    enabled: opened && isRestarting && statusPageUrl != null,
    redirectTo: statusPageUrl,
  });

  const successRedirect = useUpdateAutoReload({
    enabled: opened && showSuccess,
    redirectTo: '/',
  });

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

  const modalTitle = showRunFailure
    ? 'Update failed'
    : showSuccess
      ? 'Update completed'
      : showProgress
        ? 'Updating DocsOps'
        : 'Apply update';

  const restartCountdownText =
    restartRedirect.secondsLeft != null
      ? `Opening update status in ${restartRedirect.secondsLeft}…`
      : null;

  const successCountdownText =
    successRedirect.secondsLeft != null
      ? `Opening DocsOps in ${successRedirect.secondsLeft}…`
      : 'Opening DocsOps…';

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
          <Text size="sm">
            DocsOps has been upgraded to <strong>{activeRun.targetReleaseTag}</strong>.{' '}
            {successCountdownText}
          </Text>
          <Stepper active={UPDATE_PROGRESS_STEPS.length} size="sm" orientation="vertical">
            {UPDATE_PROGRESS_STEPS.map((step) => (
              <Stepper.Step key={step.key} label={step.label} description={step.detail} />
            ))}
            <Stepper.Completed>All steps finished.</Stepper.Completed>
          </Stepper>
          <Group justify="flex-end">
            <Button variant="default" onClick={handleDismissSuccess}>
              Stay on this page
            </Button>
          </Group>
        </Stack>
      ) : showProgress ? (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Upgrading to <strong>{activeRun.targetReleaseTag}</strong>
            {elapsed != null ? ` · ${elapsed}` : ''}
          </Text>
          {isRestarting ? (
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <ThemeIcon variant="light" color="blue" size="sm" radius="xl" mt={2}>
                <IconInfoCircle size={14} aria-hidden />
              </ThemeIcon>
              <Text size="sm" c="dimmed">
                Services are restarting. Connection errors are expected.
                {restartCountdownText != null ? ` ${restartCountdownText}` : ''}
              </Text>
            </Group>
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
          {!isRestarting && statusPageUrl != null ? (
            <Text size="sm" c="dimmed">
              You can close this dialog.{' '}
              <Text
                component="button"
                type="button"
                size="sm"
                c="grape"
                inherit
                style={{
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  textDecoration: 'underline',
                }}
                onClick={() => openUpdateStatusPage(activeRun.targetReleaseTag)}
              >
                Open update status page
              </Text>{' '}
              in a new tab to monitor progress.
            </Text>
          ) : null}
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
