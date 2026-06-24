import { Badge, Group, Tooltip } from '@mantine/core';
import { Link } from 'react-router-dom';
import { AppVersionLabel } from './AppVersionLabel.js';
import { useAdminUpdateStatus } from '../hooks/useAdminUpdateStatus.js';

type Props = {
  isAdmin: boolean;
  isMiniRail?: boolean;
  ta?: 'left' | 'center' | 'right';
  pl?: number | string;
  fz?: number | string;
  lh?: number | string;
};

export function AdminAppVersionLabel({ isAdmin, isMiniRail = false, ta, pl, fz, lh }: Props) {
  const { data: updateStatus } = useAdminUpdateStatus({ enabled: isAdmin });
  const showUpdateHint = isAdmin && updateStatus?.updateAvailable === true;

  if (!showUpdateHint) {
    return <AppVersionLabel variant="compact" ta={ta} pl={pl} fz={fz} lh={lh} />;
  }

  const versionLabel = (
    <Link to="/admin/system" style={{ textDecoration: 'none', color: 'inherit' }}>
      <Group gap={6} wrap="nowrap" justify={isMiniRail ? 'center' : 'flex-start'}>
        <AppVersionLabel variant="compact" ta={ta} pl={pl} fz={fz} lh={lh} />
        {isMiniRail ? (
          <Badge size="xs" color="orange" variant="filled" circle aria-label="Update available" />
        ) : (
          <Badge size="xs" color="orange" variant="filled">
            Update
          </Badge>
        )}
      </Group>
    </Link>
  );

  if (isMiniRail) {
    return (
      <Tooltip label="Update available — open System" position="right">
        {versionLabel}
      </Tooltip>
    );
  }

  return versionLabel;
}
