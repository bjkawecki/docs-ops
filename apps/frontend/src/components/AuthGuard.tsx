import { useEffect, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMe } from '../hooks/useMe';

export function AuthGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me, isPending, isError } = useMe({ retry: false });

  useEffect(() => {
    if (isPending) return;
    if (isError || !me?.user) {
      void navigate('/login', { state: { from: location.pathname }, replace: true });
    }
  }, [isPending, isError, me, navigate, location.pathname]);

  if (isPending || !me?.user) {
    return null;
  }

  return <>{children}</>;
}
