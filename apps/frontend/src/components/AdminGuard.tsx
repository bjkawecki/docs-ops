import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../hooks/useMe';

/**
 * Must be used inside AuthGuard. Redirects non-admins to /.
 * User data comes from the same source as the sidebar: useMe().
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

  if (isPending || !me?.user?.isAdmin) {
    return null;
  }

  return <>{children}</>;
}
