import { Link } from 'react-router-dom';
import { Box, Burger, Group, Text } from '@mantine/core';
import { MAIN_NAV_ID } from './appShellLayoutConstants.js';

type Props = {
  mobileOpened: boolean;
  onToggleMobile: () => void;
};

export function AppShellMainToolbar({ mobileOpened, onToggleMobile }: Props) {
  return (
    <Group gap="sm" mb="md" hiddenFrom="sm">
      <Burger
        opened={mobileOpened}
        onClick={onToggleMobile}
        size="sm"
        aria-label={mobileOpened ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={mobileOpened}
        aria-controls={MAIN_NAV_ID}
      />
      <Box component={Link} to="/" style={{ textDecoration: 'none' }}>
        <Text fw={500} size="lg" c="inherit">
          Docs
          <Text component="span" c="var(--mantine-primary-color-filled)" inherit>
            Ops
          </Text>
        </Text>
      </Box>
    </Group>
  );
}
