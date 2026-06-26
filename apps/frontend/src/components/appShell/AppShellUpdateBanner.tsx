import { Box, Button, Group, Loader, Text } from '@mantine/core';
import type { UpdateOverlayPhase } from '../../hooks/useUpdateInProgressOverlay.js';

type Props = {
  visible: boolean;
  phase: UpdateOverlayPhase;
  onReload: () => void;
};

function bannerText(phase: UpdateOverlayPhase): string {
  if (phase === 'reload') {
    return 'Update may be complete. Reload this page to use the new version.';
  }
  return 'System update in progress. Write operations may be temporarily blocked.';
}

export function AppShellUpdateBanner({ visible, phase, onReload }: Props) {
  if (!visible) return null;

  return (
    <Box
      px="md"
      py={8}
      style={{
        flexShrink: 0,
        borderBottom: '1px solid var(--mantine-color-default-border)',
      }}
      bg="grape.9"
      role="status"
      aria-live="polite"
    >
      <Group gap="sm" wrap="wrap" justify="center" maw={960} mx="auto">
        <Loader color="white" size="xs" type="oval" />
        <Text size="sm" c="white" ta="center" lineClamp={3} style={{ flex: 1 }}>
          {bannerText(phase)}
        </Text>
        <Button size="xs" variant="white" color="grape" onClick={onReload}>
          {phase === 'reload' ? 'Reload page' : 'Reload now'}
        </Button>
      </Group>
    </Box>
  );
}
