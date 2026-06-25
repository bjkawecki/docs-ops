import { Alert } from '@mantine/core';
import type { AdminSystemUpdateStatus } from 'backend/api-types';

type Props = {
  status: AdminSystemUpdateStatus;
};

export function AdminSystemStatusAlerts({ status }: Props) {
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
