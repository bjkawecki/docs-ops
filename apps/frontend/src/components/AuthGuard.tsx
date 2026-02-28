import { useEffect, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

export function AuthGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    data: user,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/auth/me');
      if (res.status === 401) throw new Error('Unauthorized');
      if (!res.ok) throw new Error('Auth check failed');
      return res.json() as Promise<{ id: string; name: string; email?: string }>;
    },
    retry: false,
  });

  useEffect(() => {
    if (isPending) return;
    if (isError || !user) {
      navigate('/login', { state: { from: location.pathname }, replace: true });
    }
  }, [isPending, isError, user, navigate, location.pathname]);

  if (isPending || !user) {
    return null; // oder ein kurzer Loader
  }

  return <>{children}</>;
}
