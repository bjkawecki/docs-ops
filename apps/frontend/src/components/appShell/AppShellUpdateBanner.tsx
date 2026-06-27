import { Box, Button, Flex, Loader, Text } from '@mantine/core';
import type { UpdateOverlayPhase } from '../../hooks/useUpdateInProgressOverlay.js';

type Props = {
  visible: boolean;
  phase: UpdateOverlayPhase;
  onReload: () => void;
};

function bannerText(phase: UpdateOverlayPhase): string {
  switch (phase) {
    case 'restarting':
      return 'Services are restarting. Connection errors are expected.';
    case 'reload':
      return 'Update may be complete. Reload this page to use the new version.';
    case 'preparing':
    default:
      return 'System update in progress. Write operations may be temporarily blocked.';
  }
}

export function AppShellUpdateBanner({ visible, phase, onReload }: Props) {
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
      bg="grape.9"
      role="status"
      aria-live="polite"
    >
      <Flex align="center" gap="sm" wrap="wrap" justify="center" maw={960} mx="auto">
        {showLoader ? <Loader color="white" size="xs" type="oval" /> : null}
        <Text size="sm" c="white" ta="center" lineClamp={3}>
          {bannerText(phase)}
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
