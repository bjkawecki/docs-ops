import { useEffect, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { MeResponse } from '../api/me-types';

export function AuthGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    data: me,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['me'],
    queryFn: async (): Promise<MeResponse> => {
      const res = await apiFetch('/api/v1/me');
      if (res.status === 401) throw new Error('Unauthorized');
      if (!res.ok) throw new Error('Auth check failed');
      return res.json();
    },
    retry: false,
  });

  useEffect(() => {
    if (isPending) return;
    if (isError || !me?.user) {
      navigate('/login', { state: { from: location.pathname }, replace: true });
    }
  }, [isPending, isError, me, navigate, location.pathname]);

  if (isPending || !me?.user) {
    return null;
  }

  return <>{children}</>;
}
