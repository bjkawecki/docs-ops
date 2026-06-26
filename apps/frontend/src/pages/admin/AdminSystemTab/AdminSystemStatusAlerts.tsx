import { Alert, Code, ScrollArea } from '@mantine/core';
import type { AdminSystemUpdateStatus } from 'backend/api-types';

type Props = {
  status: AdminSystemUpdateStatus;
};

export function AdminSystemStatusAlerts({ status }: Props) {
  if (status.activeUpdateRun?.status === 'failed') {
    return (
      <Alert color="red" variant="filled" title="Update failed">
        <ScrollArea.Autosize mah={240}>
          <Code
            block
            c="red.0"
            bg="transparent"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {status.activeUpdateRun.errorMessage ?? 'The update could not be completed.'}
          </Code>
        </ScrollArea.Autosize>
      </Alert>
    );
  }

  if (!status.updateCheckEnabled) {
    return null;
  }

  if (status.updateAvailable) {
    return (
      <Alert color="blue" variant="filled" title="Update available">
        A newer release is available. Review the steps before upgrading production.
      </Alert>
    );
  }

  return null;
}
