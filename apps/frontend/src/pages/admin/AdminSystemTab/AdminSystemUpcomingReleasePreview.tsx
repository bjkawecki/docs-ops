import { useState } from 'react';
import {
  Alert,
  Anchor,
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconExternalLink } from '@tabler/icons-react';
import type { AdminSystemUpdateStatus } from 'backend/api-types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { releaseMarkdownComponents } from '../../whatsNew/releaseMarkdownComponents.js';

type Props = {
  status: AdminSystemUpdateStatus;
};

export function AdminSystemUpcomingReleasePreview({ status }: Props) {
  const [opened, setOpened] = useState(false);
  const version = status.upcomingReleaseNotesVersion;

  if (!status.updateAvailable || version == null) {
    return null;
  }

  const hasMarkdown =
    status.upcomingReleaseNotesMarkdown != null &&
    status.upcomingReleaseNotesMarkdown.trim().length > 0;
  const hasError = status.upcomingReleaseNotesError != null;

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <UnstyledButton
          type="button"
          aria-expanded={opened}
          onClick={() => setOpened((value) => !value)}
          style={{ width: '100%', textAlign: 'left' }}
        >
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Title order={4} m={0}>
              What&apos;s in v{version}?
            </Title>
            <IconChevronDown
              size={18}
              aria-hidden
              style={{
                flexShrink: 0,
                color: 'var(--mantine-color-dimmed)',
                transition: 'transform 0.2s ease',
                transform: opened ? 'rotate(0deg)' : 'rotate(-90deg)',
              }}
            />
          </Group>
        </UnstyledButton>

        <Collapse in={opened}>
          <Stack gap="sm" pt="xs">
            {hasError && (
              <Alert color="yellow" title="Could not load release notes preview">
                {status.upcomingReleaseNotesError}
                {status.releaseUrl != null && (
                  <>
                    {' '}
                    <Anchor href={status.releaseUrl} target="_blank" rel="noreferrer" size="sm">
                      <Group gap={4} component="span">
                        View on GitHub
                        <IconExternalLink size={14} />
                      </Group>
                    </Anchor>
                  </>
                )}
              </Alert>
            )}

            {hasMarkdown && (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={releaseMarkdownComponents}>
                {status.upcomingReleaseNotesMarkdown}
              </ReactMarkdown>
            )}

            {!hasMarkdown && !hasError && (
              <Text size="sm" c="dimmed">
                No release notes preview available.
                {status.releaseUrl != null && (
                  <>
                    {' '}
                    <Anchor href={status.releaseUrl} target="_blank" rel="noreferrer" size="sm">
                      View release on GitHub
                    </Anchor>
                  </>
                )}
              </Text>
            )}
          </Stack>
        </Collapse>
      </Stack>
    </Paper>
  );
}
