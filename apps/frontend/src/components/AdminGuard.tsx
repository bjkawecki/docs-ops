import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../hooks/useMe';

/**
 * Muss innerhalb von AuthGuard verwendet werden. Leitet Nicht-Admins auf / weiter.
 * Nutzerdaten kommen aus derselben Quelle wie die Sidebar: useMe().
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { data: me, isPending } = useMe();

  useEffect(() => {
    if (isPending || !me) return;
    if (!me.user.isAdmin) {
      navigate('/', { replace: true });
    }
  }, [isPending, me, navigate]);

  if (isPending || !me?.user?.isAdmin) {
    return null;
  }

  return <>{children}</>;
}
