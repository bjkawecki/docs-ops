import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Anchor,
  Button,
  Code,
  Collapse,
  CopyButton,
  Group,
  List,
  Modal,
  Paper,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { Link } from 'react-router-dom';
import { IconCheck, IconChevronDown, IconCopy, IconExternalLink } from '@tabler/icons-react';

const modalCodeBlockStyle = {
  whiteSpace: 'pre',
  maxWidth: '100%',
  minWidth: 0,
  overflowX: 'auto',
} as const;

const UPDATER_ENV_EXAMPLE = `DOCSOPS_UPDATER_URL=http://docsops-updater:8090
DOCSOPS_UPDATER_TOKEN=<token from step 1>`;

const COMPOSE_UPDATER_UP_COMMAND = `sudo docker compose \\
  --env-file /etc/docsops/docsops.env \\
  -f docker-compose.yml \\
  -f docker-compose.prod.yml \\
  up -d docsops-updater app docsops-job-worker`;

type Props = {
  opened: boolean;
  onClose: () => void;
  latestReleaseTag: string | null;
  releaseUrl: string | null;
  updaterConfigured?: boolean;
  updaterMissingEnvVars?: string[];
};

function OneClickUpdateSetupAlert({
  missingEnvVars,
  modalOpened,
}: {
  missingEnvVars: string[];
  modalOpened: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!modalOpened) setExpanded(false);
  }, [modalOpened]);

  return (
    <Paper withBorder p="md" radius="md">
      <UnstyledButton
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        style={{ width: '100%', textAlign: 'left' }}
      >
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text size="sm" fw={600} c="red">
            One-click update not available
          </Text>
          <IconChevronDown
            size={18}
            aria-hidden
            style={{
              flexShrink: 0,
              color: 'var(--mantine-color-dimmed)',
              transition: 'transform 0.2s ease',
              transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          />
        </Group>
      </UnstyledButton>

      <Collapse in={expanded}>
        <Stack gap="sm" pt="sm" style={{ minWidth: 0 }}>
          <Text size="sm" fw={500}>
            Missing on this instance:
          </Text>
          <List size="sm" spacing="xs">
            {missingEnvVars.map((name) => (
              <List.Item key={name}>
                <Code>{name}</Code> in the server environment file
              </List.Item>
            ))}
            <List.Item>
              <Code>docsops-updater</Code> service running (Docker Compose)
            </List.Item>
          </List>
          <Text size="sm" fw={500} mt="xs">
            To enable one-click update on the server:
          </Text>
          <List type="ordered" size="sm" spacing="xs">
            <List.Item>
              Generate a shared secret: <Code>openssl rand -hex 32</Code>
            </List.Item>
            <List.Item>
              Add to <Code>/etc/docsops/docsops.env</Code> (same values for app, worker, and
              updater):
              <Code block mt="xs" w="100%" style={modalCodeBlockStyle}>
                {UPDATER_ENV_EXAMPLE}
              </Code>
            </List.Item>
            <List.Item>
              Start or restart the stack, including the updater:
              <Code block mt="xs" w="100%" style={modalCodeBlockStyle}>
                {COMPOSE_UPDATER_UP_COMMAND}
              </Code>
            </List.Item>
            <List.Item>
              Reload this page — the Apply update button should appear on System.
            </List.Item>
          </List>
        </Stack>
      </Collapse>
    </Paper>
  );
}

export function AdminSystemUpdateStepsModal({
  opened,
  onClose,
  latestReleaseTag,
  releaseUrl,
  updaterConfigured = false,
  updaterMissingEnvVars = [],
}: Props) {
  const updateCommand = 'sudo /opt/docsops/scripts/update.sh';

  return (
    <Modal opened={opened} onClose={onClose} title="How to update (SSH)" size="md">
      <Stack gap="md">
        {updaterConfigured ? (
          <Text size="sm">
            For production, prefer <strong>Apply update</strong> on this tab (automatic backup, then
            upgrade). Use the steps below only for manual updates on the host.
          </Text>
        ) : (
          <>
            <OneClickUpdateSetupAlert missingEnvVars={updaterMissingEnvVars} modalOpened={opened} />
            <Text size="sm">
              Until one-click update is configured, upgrade on the host via SSH. Create an
              operational backup in{' '}
              <Text component={Link} to="/admin/backup" fw={500}>
                Admin → Backup
              </Text>{' '}
              first.
            </Text>
          </>
        )}

        {updaterConfigured ? (
          <Text size="sm" c="dimmed">
            For a manual run, create a backup first in{' '}
            <Text component={Link} to="/admin/backup" fw={500}>
              Admin → Backup
            </Text>
            .
          </Text>
        ) : null}

        <Text size="sm" fw={500}>
          Manual upgrade on the host
        </Text>
        {latestReleaseTag == null ? (
          <Text size="sm" c="dimmed">
            Without a version argument, <Code>update.sh</Code> uses the latest GitHub release. Pin a
            version: <Code>sudo /opt/docsops/scripts/update.sh vX.Y.Z</Code>
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            Latest release: <Code>{latestReleaseTag}</Code>. Pin:{' '}
            <Code>sudo /opt/docsops/scripts/update.sh {latestReleaseTag}</Code>
          </Text>
        )}
        <Group gap="xs" align="flex-start" wrap="nowrap" style={{ minWidth: 0 }}>
          <Code block w="100%" style={{ flex: 1, ...modalCodeBlockStyle }}>
            {updateCommand}
          </Code>
          <CopyButton value={updateCommand} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied' : 'Copy command'} withArrow>
                <ActionIcon
                  variant="light"
                  size="lg"
                  aria-label={copied ? 'Copied' : 'Copy command'}
                  onClick={copy}
                >
                  {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>

        {releaseUrl != null && (
          <Anchor href={releaseUrl} target="_blank" rel="noreferrer" size="sm">
            <Group gap={4} component="span">
              View release on GitHub
              <IconExternalLink size={14} />
            </Group>
          </Anchor>
        )}

        <Group justify="flex-end">
          <Button onClick={onClose}>Close</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
