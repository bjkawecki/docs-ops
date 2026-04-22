import { Navigate } from 'react-router-dom';
import { useMe } from '../../hooks/useMe';
import { Loader } from '@mantine/core';

/**
 * Handles /team (no teamId): redirects to the user's team if exactly one, otherwise to home.
 */
export function TeamRedirectPage() {
  const { data: me, isPending } = useMe();
  if (isPending) return <Loader size="sm" />;
  const teams = me?.identity.teams ?? [];
  if (teams.length === 1) {
    return <Navigate to={`/team/${teams[0].teamId}`} replace />;
  }
  return <Navigate to="/" replace />;
}
