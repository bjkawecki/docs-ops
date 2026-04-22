import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Loader } from '@mantine/core';
import { useMe } from '../../hooks/useMe';

/**
 * Must be used inside AuthGuard. Redirects non-admins to /.
 * Shows a loader while me is loading so we don't flash blank or redirect too early.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { data: me, isPending } = useMe();

  useEffect(() => {
    if (isPending || !me) return;
    if (!me.user.isAdmin) {
      void navigate('/', { replace: true });
    }
  }, [isPending, me, navigate]);

  if (isPending || !me) {
    return (
      <Box
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}
      >
        <Loader size="sm" />
      </Box>
    );
  }

  if (!me.user.isAdmin) {
    return null;
  }

  return <>{children}</>;
}
