import {
  Box,
  Card,
  Container,
  Flex,
  Group,
  NavLink,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { IconHelp } from '@tabler/icons-react';
import { HELP_TOPICS } from './helpTopics';

/** Max width of the help content card (readable line length including padding). */
const HELP_PANEL_MAX_WIDTH = 720;

export function HelpLayout() {
  const { pathname } = useLocation();

  return (
    <Container fluid maw={1600} px="md" mb="xl">
      <Stack gap="lg" mb="xl" mt="md">
        <GroupTitleRow />
      </Stack>

      <Paper withBorder={false} p="lg" radius="md">
        <Flex
          direction={{ base: 'column', lg: 'row' }}
          gap={{ base: 'xl', lg: 48 }}
          align="flex-start"
        >
          <Box
            w={{ base: '100%', lg: 280 }}
            style={{
              flexShrink: 0,
              position: 'sticky',
              top: 'var(--mantine-spacing-xl)',
            }}
            data-help-topics-nav
          >
            <Text
              tt="uppercase"
              fz="xs"
              fw={600}
              c="dimmed"
              mb="sm"
              style={{ paddingLeft: 'var(--mantine-spacing-xs)' }}
            >
              In this guide
            </Text>
            <Stack component="nav" gap={2}>
              {HELP_TOPICS.map((topic) => (
                <NavLink
                  key={topic.to}
                  component={Link}
                  to={topic.to}
                  label={topic.label}
                  active={pathname === topic.to}
                  variant="light"
                  style={{ borderRadius: 'var(--mantine-radius-sm)' }}
                />
              ))}
            </Stack>
          </Box>

          <Box flex={1} maw="100%" style={{ minWidth: 0 }}>
            <Card
              withBorder
              padding="xl"
              maw={HELP_PANEL_MAX_WIDTH}
              w="100%"
              style={{ textAlign: 'left' }}
            >
              <Box style={{ width: '100%', textAlign: 'left' }}>
                <Outlet />
              </Box>
            </Card>
          </Box>
        </Flex>
      </Paper>
    </Container>
  );
}

function GroupTitleRow() {
  return (
    <Group gap="sm" align="center" wrap="nowrap">
      <IconHelp size={32} stroke={1.5} color="var(--mantine-color-dimmed)" aria-hidden />
      <Title order={1}>Help</Title>
    </Group>
  );
}
