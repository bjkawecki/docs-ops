import { Card, Text } from '@mantine/core';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { PageWithTabs } from '../components/PageWithTabs';

/**
 * Department context view: card grid for processes/projects with this department as owner. Placeholder.
 */
export function DepartmentContextPage() {
  const { departmentId } = useParams<{ departmentId: string }>();
  const {
    data: department,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['department', departmentId],
    queryFn: async () => {
      if (!departmentId) throw new Error('Missing departmentId');
      const res = await apiFetch(`/api/v1/departments/${departmentId}`);
      if (!res.ok) throw new Error('Failed to load department');
      return res.json() as Promise<{ id: string; name: string }>;
    },
    enabled: !!departmentId,
  });

  if (!departmentId) return null;
  if (isPending)
    return (
      <Text size="sm" c="dimmed">
        Loading…
      </Text>
    );
  if (isError || !department)
    return (
      <Text size="sm" c="red">
        Department not found.
      </Text>
    );

  return (
    <PageWithTabs
      title={department.name}
      description="Department context – processes and projects. Card grid to follow."
    >
      <Card withBorder padding="md">
        <Text size="sm" c="dimmed">
          Card grid for this department's contexts will be populated from API.
        </Text>
      </Card>
    </PageWithTabs>
  );
}
