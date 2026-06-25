import { Box, Button, List, Loader, Stack, Text, Title } from '@mantine/core';
import type { UpdateOverlayPhase } from '../../hooks/useUpdateInProgressOverlay.js';
import { UPDATE_PROGRESS_STEPS } from '../../pages/admin/AdminSystemTab/updateProgressSteps.js';

type Props = {
  visible: boolean;
  phase: UpdateOverlayPhase;
  onDismiss: () => void;
};

function overlayMessage(phase: UpdateOverlayPhase): { title: string; body: string } {
  if (phase === 'reload') {
    return {
      title: 'Update may be complete',
      body: 'The application is responding again. Reload this page to use the new version.',
    };
  }
  return {
    title: 'System update in progress',
    body: 'Containers are restarting. This page may stop updating until the API is back.',
  };
}

export function AppShellUpdateInProgressOverlay({ visible, phase, onDismiss }: Props) {
  if (!visible) return null;

  const { title, body } = overlayMessage(phase);

  const handleReload = () => {
    onDismiss();
    window.location.reload();
  };

  return (
    <Box
      pos="fixed"
      inset={0}
      bg="rgba(0, 0, 0, 0.72)"
      style={{ zIndex: 1000 }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-overlay-title"
      aria-describedby="update-overlay-body"
    >
      <Stack
        align="center"
        justify="center"
        gap="lg"
        mih="100%"
        px="md"
        style={{ maxWidth: 480, margin: '0 auto' }}
      >
        <Loader color="orange" size="lg" type="bars" />
        <Title id="update-overlay-title" order={3} c="white" ta="center">
          {title}
        </Title>
        <Text id="update-overlay-body" size="sm" c="gray.4" ta="center">
          {body}
        </Text>
        {phase === 'in-progress' ? (
          <List size="sm" c="gray.5" spacing={4} w="100%" maw={360}>
            {UPDATE_PROGRESS_STEPS.map((step) => (
              <List.Item key={step.key}>
                {step.label}
                {step.estimate ? ` (${step.estimate})` : ''}
              </List.Item>
            ))}
          </List>
        ) : null}
        {phase === 'reload' ? (
          <Button color="orange" onClick={handleReload}>
            Reload page
          </Button>
        ) : (
          <Button variant="default" onClick={handleReload}>
            Reload now
          </Button>
        )}
      </Stack>
    </Box>
  );
}
