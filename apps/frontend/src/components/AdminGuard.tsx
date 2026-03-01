import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { MeResponse } from '../api/me-types';

/**
 * Muss innerhalb von AuthGuard verwendet werden. Leitet Nicht-Admins auf / weiter.
 * Nutzerdaten kommen aus derselben Quelle wie die Sidebar: useQuery(['me']).
 */
export function AdminGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { data: me, isPending } = useQuery<MeResponse>({ queryKey: ['me'] });

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
