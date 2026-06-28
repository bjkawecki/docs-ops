import { Alert, Button, Group, Stack, Text } from '@mantine/core';

type Props = {
  remotePending: { revision: number; doc: unknown } | null;
  isRevisionStale: boolean;
  dirty: boolean;
  knownServerRevision: number;
  appliedRevision: number | null;
  incomingRevision: number;
  onLoadLatest: () => void;
  onKeepMine: () => void;
};

export function DraftCollaborationBanner({
  remotePending,
  isRevisionStale,
  dirty,
  knownServerRevision,
  appliedRevision,
  incomingRevision,
  onLoadLatest,
  onKeepMine,
}: Props) {
  const show = remotePending ?? (isRevisionStale && dirty);
  if (!show) return null;

  return (
    <Alert color="yellow" title="Remote update available">
      <Stack gap="xs">
        <Text size="sm">
          {remotePending
            ? `A newer draft revision (${remotePending.revision}) is available on the server. Your local unsaved changes are kept until you decide.`
            : `Draft revision ${knownServerRevision} is available on the server (you have ${appliedRevision ?? incomingRevision}). Reload to see the latest content.`}
        </Text>
        <Group gap="xs">
          <Button size="compact-sm" variant="filled" onClick={() => void onLoadLatest()}>
            Load latest
          </Button>
          {remotePending && (
            <Button size="compact-sm" variant="default" onClick={onKeepMine}>
              Keep mine
            </Button>
          )}
        </Group>
      </Stack>
    </Alert>
  );
}
