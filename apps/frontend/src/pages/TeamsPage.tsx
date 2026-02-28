import { List, Loader, Alert, Card } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { Company } from 'backend/api-types';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageHeader';

type CompaniesRes = { items: Company[]; total: number; limit: number; offset: number };

export function TeamsPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/companies?limit=50');
      if (!res.ok) throw new Error('Error loading');
      return res.json() as Promise<CompaniesRes>;
    },
  });

  if (isPending) return <Loader size="sm" />;
  if (isError) {
    return (
      <Alert color="red" title="Error">
        {error?.message}
      </Alert>
    );
  }

  return (
    <>
      <PageHeader
        title="Teams / Departments"
        description="Teams – first list (companies). Content to follow."
      />
      <Card withBorder padding="md">
        {data && data.items.length > 0 ? (
          <List>
            {data.items.map((c) => (
              <List.Item key={c.id}>{c.name}</List.Item>
            ))}
          </List>
        ) : (
          <span style={{ fontSize: 14, color: 'var(--mantine-color-dimmed)' }}>No entries.</span>
        )}
      </Card>
    </>
  );
}
