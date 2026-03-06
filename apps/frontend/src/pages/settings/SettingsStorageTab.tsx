import { Box, Card, Stack, Text, Table, Select, Loader, Alert, Grid } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '../../api/client';
import type { StorageOverviewResponse } from '../../api/storage-types';
import { useMe } from '../../hooks/useMe';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

type ScopeOption =
  | { value: 'personal'; label: string }
  | { value: `team-${string}`; label: string; teamId: string }
  | { value: `department-${string}`; label: string; departmentId: string }
  | { value: `company-${string}`; label: string; companyId: string };

export function SettingsStorageTab() {
  const { data: me, isPending: mePending } = useMe();
  const [selectedScope, setSelectedScope] = useState<string>('personal');

  const { data: companiesData } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await apiFetch('/api/v1/companies?limit=100');
      if (!res.ok) throw new Error('Failed to load companies');
      return (await res.json()) as { items: { id: string; name: string }[] };
    },
    enabled: !!me?.user.isAdmin,
  });

  const scopeOptions = useMemo((): ScopeOption[] => {
    if (!me) return [];
    const opts: ScopeOption[] = [{ value: 'personal', label: 'Personal (my storage)' }];
    for (const t of me.identity.teams) {
      if (t.role === 'leader') {
        opts.push({
          value: `team-${t.teamId}`,
          label: `Team: ${t.teamName}`,
          teamId: t.teamId,
        });
      }
    }
    for (const d of me.identity.departmentLeads) {
      opts.push({
        value: `department-${d.id}`,
        label: `Department: ${d.name}`,
        departmentId: d.id,
      });
    }
    const companyIdsAdded = new Set(me.identity.companyLeads.map((c) => c.id));
    for (const c of me.identity.companyLeads) {
      opts.push({
        value: `company-${c.id}`,
        label: `Company: ${c.name}`,
        companyId: c.id,
      });
    }
    if (me.user.isAdmin && companiesData?.items) {
      for (const c of companiesData.items) {
        if (!companyIdsAdded.has(c.id)) {
          opts.push({
            value: `company-${c.id}`,
            label: `Company: ${c.name}`,
            companyId: c.id,
          });
        }
      }
    }
    return opts;
  }, [me, companiesData?.items]);

  const queryParams = useMemo(() => {
    if (selectedScope === 'personal') return null;
    const opt = scopeOptions.find((o) => o.value === selectedScope);
    if (!opt) return null;
    if ('teamId' in opt) return { scope: 'team', teamId: opt.teamId };
    if ('departmentId' in opt) return { scope: 'department', departmentId: opt.departmentId };
    if ('companyId' in opt) return { scope: 'company', companyId: opt.companyId };
    return null;
  }, [selectedScope, scopeOptions]);

  const storageUrl = useMemo(() => {
    const base = '/api/v1/me/storage';
    if (!queryParams) return base;
    const q = new URLSearchParams();
    q.set('scope', queryParams.scope);
    if (queryParams.teamId) q.set('teamId', queryParams.teamId);
    if (queryParams.departmentId) q.set('departmentId', queryParams.departmentId);
    if (queryParams.companyId) q.set('companyId', queryParams.companyId);
    return `${base}?${q.toString()}`;
  }, [queryParams]);

  const {
    data: storage,
    isPending: storagePending,
    isError,
    error,
  } = useQuery({
    queryKey: ['me', 'storage', storageUrl],
    queryFn: async (): Promise<StorageOverviewResponse> => {
      const res = await apiFetch(storageUrl);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as StorageOverviewResponse;
    },
    enabled: !!me,
  });

  if (mePending || !me) {
    return (
      <Box p="md">
        <Loader size="sm" />
      </Box>
    );
  }

  return (
    <Grid gutter="md">
      <Grid.Col span={{ base: 12, sm: 12 }}>
        <Card withBorder padding={0} h="100%">
          <Box py="xs" px="md" bg="var(--mantine-color-default-hover)">
            <Text fw={600} size="md">
              Storage
            </Text>
          </Box>
          <Box p="md">
            <Text size="xs" c="dimmed" mb="md">
              Storage used by document attachments (and PDF exports). Choose a scope to view your
              usage or, as a lead, your team, department, or company.
            </Text>
            {scopeOptions.length > 1 && (
              <Select
                label="Scope"
                data={scopeOptions.map((o) => ({ value: o.value, label: o.label }))}
                value={selectedScope}
                onChange={(v) => v && setSelectedScope(v)}
                mb="md"
                size="sm"
                style={{ maxWidth: 320 }}
              />
            )}
            {isError && (
              <Alert color="red" mb="md">
                {error instanceof Error ? error.message : 'Failed to load storage'}
              </Alert>
            )}
            {storagePending && <Loader size="sm" />}
            {storage && !storagePending && (
              <Stack gap="md">
                <Text size="sm">
                  <Text span fw={600}>
                    {formatBytes(storage.usedBytes)}
                  </Text>
                  {' used · '}
                  <Text span fw={600}>
                    {storage.attachmentCount}
                  </Text>
                  {' attachment(s)'}
                </Text>
                {storage.byUser && storage.byUser.length > 0 && (
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>User</Table.Th>
                        <Table.Th>Used</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {storage.byUser.map((u) => (
                        <Table.Tr key={u.userId}>
                          <Table.Td>
                            <Text size="sm">{u.name || u.userId}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">{formatBytes(u.usedBytes)}</Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
              </Stack>
            )}
          </Box>
        </Card>
      </Grid.Col>
    </Grid>
  );
}
