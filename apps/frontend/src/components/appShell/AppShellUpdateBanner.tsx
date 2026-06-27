import { Box, Button, Flex, Loader, Text } from '@mantine/core';
import type { UpdateOverlayPhase } from '../../hooks/useUpdateInProgressOverlay.js';

type Props = {
  visible: boolean;
  phase: UpdateOverlayPhase;
  reloadCountdownSeconds: number | null;
  onReload: () => void;
};

function bannerText(phase: UpdateOverlayPhase, reloadCountdownSeconds: number | null): string {
  switch (phase) {
    case 'restarting':
      return 'Services are restarting. Connection errors are expected.';
    case 'reload':
      return 'Update may be complete. Reload this page to use the new version.';
    case 'success':
      return reloadCountdownSeconds != null
        ? `Update complete. Reloading in ${reloadCountdownSeconds}…`
        : 'Update complete. Reloading…';
    case 'preparing':
    default:
      return 'System update in progress. Write operations may be temporarily blocked.';
  }
}

function bannerBackground(phase: UpdateOverlayPhase): string {
  return phase === 'success' ? 'green.9' : 'grape.9';
}

export function AppShellUpdateBanner({ visible, phase, reloadCountdownSeconds, onReload }: Props) {
  if (!visible) return null;

  const showLoader = phase === 'preparing' || phase === 'restarting';
  const showReloadButton = phase === 'reload';

  return (
    <Box
      px="md"
      py={8}
      style={{
        flexShrink: 0,
        borderBottom: '1px solid var(--mantine-color-default-border)',
      }}
      bg={bannerBackground(phase)}
      role="status"
      aria-live="polite"
    >
      <Flex align="center" gap="sm" wrap="wrap" justify="center" maw={960} mx="auto">
        {showLoader ? <Loader color="white" size="xs" type="oval" /> : null}
        <Text size="sm" c="white" ta="center" lineClamp={3}>
          {bannerText(phase, reloadCountdownSeconds)}
        </Text>
        {showReloadButton ? (
          <Button size="xs" variant="white" color="grape" onClick={onReload} ml="auto">
            Reload page
          </Button>
        ) : null}
      </Flex>
    </Box>
  );
}
