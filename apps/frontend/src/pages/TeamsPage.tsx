import { Title, Text, Stack, List, Loader, Alert } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { Company } from 'backend/api-types';
import { apiFetch } from '../api/client';

type CompaniesRes = { items: Company[]; total: number; limit: number; offset: number };

export function TeamsPage() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/companies?limit=50');
      if (!res.ok) throw new Error('Fehler beim Laden');
      return res.json() as Promise<CompaniesRes>;
    },
  });

  if (isPending) return <Loader size="sm" />;
  if (isError) {
    return (
      <Alert color="red" title="Fehler">
        {error?.message}
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      <Title order={2}>Teams / Abteilungen</Title>
      <Text size="sm" c="dimmed">
        Bereich Teams – erste Liste (Firmen). Inhalt folgt in Abschnitt 7.
      </Text>
      {data && data.items.length > 0 ? (
        <List>
          {data.items.map((c) => (
            <List.Item key={c.id}>{c.name}</List.Item>
          ))}
        </List>
      ) : (
        <Text size="sm" c="dimmed">
          Keine Einträge.
        </Text>
      )}
    </Stack>
  );
}
