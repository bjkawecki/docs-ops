import { Alert, Button, Center, Group, Loader, Modal, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { AdminSystemUpdateStatus } from 'backend/api-types';
import { WizardStepperLayout } from '../../../components/WizardStepperLayout.js';
import { useElapsedSince } from '../../../hooks/useElapsedSince.js';
import { useApplySystemUpdate, usePollUpdateRun } from '../../../hooks/useAdminUpdateStatus.js';
import { UPDATE_PROGRESS_STEPS, updateProgressStepIndex } from './updateProgressSteps.js';

type Props = {
  opened: boolean;
  onClose: () => void;
  status: AdminSystemUpdateStatus;
};

export function AdminSystemApplyUpdateModal({ opened, onClose, status }: Props) {
  const [updateRunId, setUpdateRunId] = useState<string | null>(null);
  const applyMutation = useApplySystemUpdate();
  const pollQuery = usePollUpdateRun(updateRunId, { enabled: opened && updateRunId != null });

  const activeRun = pollQuery.data;
  const inProgress =
    activeRun != null &&
    (activeRun.status === 'queued' ||
      activeRun.status === 'backing_up' ||
      activeRun.status === 'applying');
  const elapsed = useElapsedSince(activeRun?.startedAt ?? activeRun?.createdAt);
  const stepIndex = activeRun ? updateProgressStepIndex(activeRun.status) : 0;

  useEffect(() => {
    if (!opened) {
      setUpdateRunId(null);
    }
  }, [opened]);

  useEffect(() => {
    if (status.activeUpdateRun?.id && opened && updateRunId == null) {
      setUpdateRunId(status.activeUpdateRun.id);
    }
  }, [opened, status.activeUpdateRun?.id, updateRunId]);

  const handleClose = () => {
    if (inProgress) return;
    onClose();
  };

  const handleApply = async () => {
    try {
      const result = await applyMutation.mutateAsync();
      setUpdateRunId(result.updateRunId);
    } catch {
      // parent may show notification
    }
  };

  const tag = status.latestReleaseTag ?? 'vX.Y.Z';

  const wizardSteps = UPDATE_PROGRESS_STEPS.map((step, index) => ({
    label: step.label,
    description:
      index === stepIndex
        ? `${step.detail}${step.estimate ? ` · typical ${step.estimate}` : ''}`
        : step.estimate
          ? `Typical ${step.estimate}`
          : step.detail,
    loading: inProgress && index === stepIndex,
  }));

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={updateRunId ? 'Update in progress' : 'Apply update'}
      size="lg"
      closeOnClickOutside={!inProgress}
      closeOnEscape={!inProgress}
    >
      {updateRunId == null ? (
        <Stack gap="md">
          <Text size="sm">
            A backup will be created automatically, then DocsOps will upgrade to{' '}
            <strong>{tag}</strong>. Write operations are blocked during the update.
          </Text>
          <Stack gap={4}>
            {UPDATE_PROGRESS_STEPS.map((step) => (
              <Text key={step.key} size="sm" c="dimmed">
                • {step.label}
                {step.estimate ? ` (${step.estimate})` : ''}
              </Text>
            ))}
          </Stack>
          <Text size="sm" c="dimmed">
            Total time is usually 5–20 minutes depending on database size. You may need to reload
            this page after containers restart.
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
      ) : (
        <Stack gap="md">
          {pollQuery.isPending && activeRun == null ? (
            <Center py="sm">
              <Loader size="sm" />
            </Center>
          ) : null}

          {pollQuery.isError ? (
            <Alert color="red" title="Could not load update status">
              The update may still be running on the server. Reload this page and check Admin →
              System, or inspect container logs on the host.
            </Alert>
          ) : null}

          {activeRun && activeRun.status !== 'failed' ? (
            <WizardStepperLayout
              activeStep={stepIndex}
              steps={wizardSteps}
              completed={
                activeRun.status === 'succeeded' ? (
                  <Text size="sm">All steps finished — reload the app to use the new version.</Text>
                ) : undefined
              }
              footer={
                <Group justify="flex-end">
                  <Button disabled={inProgress} onClick={handleClose}>
                    {inProgress ? 'Please wait…' : 'Close'}
                  </Button>
                  {activeRun.status === 'succeeded' ? (
                    <Button onClick={() => window.location.reload()}>Reload page</Button>
                  ) : null}
                </Group>
              }
            >
              <Stack gap="sm">
                <Text size="sm" fw={500}>
                  Upgrading to {activeRun.targetReleaseTag}
                </Text>
                {elapsed != null ? (
                  <Text size="xs" c="dimmed">
                    Running for {elapsed}
                  </Text>
                ) : null}

                {activeRun.status === 'applying' || activeRun.status === 'succeeded' ? (
                  <Alert color="blue" variant="light" title="Connection may drop">
                    While containers restart, this page can stop updating. Reload when the stack is
                    back, or wait for the full-screen update notice.
                  </Alert>
                ) : null}

                {activeRun.status === 'succeeded' ? (
                  <Alert color="green" variant="light" title="Update completed">
                    The application has been upgraded.
                  </Alert>
                ) : null}
              </Stack>
            </WizardStepperLayout>
          ) : null}

          {activeRun?.status === 'failed' ? (
            <>
              <Alert color="red" title="Update failed">
                {activeRun.errorMessage ?? 'The update could not be completed.'}
              </Alert>
              <Group justify="flex-end">
                <Button onClick={handleClose}>Close</Button>
              </Group>
            </>
          ) : null}
        </Stack>
      )}
    </Modal>
  );
}
