import { Navigate } from 'react-router-dom';
import { useMe } from '../hooks/useMe';
import { Loader } from '@mantine/core';

/**
 * Handles /department (no departmentId): redirects to the user's department if exactly one, otherwise to home.
 */
export function DepartmentRedirectPage() {
  const { data: me, isPending } = useMe();
  if (isPending) return <Loader size="sm" />;
  const departments = me?.identity.departments ?? [];
  if (departments.length === 1) {
    return <Navigate to={`/department/${departments[0].id}`} replace />;
  }
  return <Navigate to="/" replace />;
}
