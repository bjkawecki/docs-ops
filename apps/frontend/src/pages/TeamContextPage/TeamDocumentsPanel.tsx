import { Card, Group, Pagination, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import type { NavigateFunction } from 'react-router-dom';
import { SortableTableTh } from '../../components/SortableTableTh';
import { formatTableDate } from '../../lib/formatDate';
import type { TeamDocItem } from './teamContextPageTypes';

export type TeamDocumentsPanelProps = {
  docsPending: boolean;
  docsSearch: string;
  docsContextType: string;
  docsSortBy: string;
  docsSortOrder: string;
  docsPage: number;
  docsLimit: number;
  docsTotal: number;
  docsTotalPages: number;
  teamDocs: TeamDocItem[];
  teamId: string | undefined;
  setDocsFilter: (key: string, value: string | null) => void;
  setDocsSort: (col: string) => void;
  setDocsPage: (p: number) => void;
  setDocsLimit: (value: number) => void;
  navigate: NavigateFunction;
};

export function TeamDocumentsPanel({
  docsPending,
  docsSearch,
  docsContextType,
  docsSortBy,
  docsSortOrder,
  docsPage,
  docsLimit,
  docsTotal,
  docsTotalPages,
  teamDocs,
  teamId,
  setDocsFilter,
  setDocsSort,
  setDocsPage,
  setDocsLimit,
  navigate,
}: TeamDocumentsPanelProps) {
  return (
    <Stack gap="md">
      {docsPending ? (
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            Loading documents…
          </Text>
        </Card>
      ) : (
        <>
          <Group gap="md" wrap="wrap" align="flex-end">
            <TextInput
              label="Search"
              placeholder="Search by name"
              value={docsSearch}
              onChange={(e) => setDocsFilter('docsSearch', e.currentTarget.value)}
              style={{ minWidth: 200 }}
            />
            <Select
              label="Context type"
              placeholder="All"
              data={[
                { value: '', label: 'All' },
                { value: 'process', label: 'Process' },
                { value: 'project', label: 'Project' },
              ]}
              value={docsContextType || null}
              onChange={(v) => setDocsFilter('docsContextType', v ?? '')}
              clearable
              style={{ minWidth: 140 }}
            />
            <Text size="sm" c="dimmed" style={{ marginLeft: 'auto' }}>
              {docsTotal} document{docsTotal !== 1 ? 's' : ''}
            </Text>
            <Select
              label="Per page"
              data={[
                { value: '10', label: '10' },
                { value: '25', label: '25' },
                { value: '50', label: '50' },
                { value: '100', label: '100' },
              ]}
              value={String(docsLimit)}
              onChange={(v) => v && setDocsLimit(parseInt(v, 10))}
              style={{ width: 90 }}
            />
          </Group>
          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <SortableTableTh
                  label="Title"
                  column="title"
                  sortBy={docsSortBy}
                  sortOrder={docsSortOrder}
                  onClick={() => setDocsSort('title')}
                />
                <SortableTableTh
                  label="Context"
                  column="contextName"
                  sortBy={docsSortBy}
                  sortOrder={docsSortOrder}
                  onClick={() => setDocsSort('contextName')}
                />
                <SortableTableTh
                  label="Last updated"
                  column="updatedAt"
                  sortBy={docsSortBy}
                  sortOrder={docsSortOrder}
                  onClick={() => setDocsSort('updatedAt')}
                />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {teamDocs.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={3}>
                    <Text size="sm" c="dimmed">
                      No documents in this team yet. Create a process or project and add documents,
                      or publish drafts from the Drafts tab.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                teamDocs.map((d) => (
                  <Table.Tr
                    key={d.id}
                    data-clickable-table-row
                    onClick={() => {
                      void navigate(`/documents/${d.id}`);
                    }}
                  >
                    <Table.Td>
                      <Text fw={500} size="sm">
                        {d.title || d.id}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {d.contextName || '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatTableDate(d.updatedAt)}</Text>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
          {teamId != null && !docsPending && (
            <Group justify="flex-end">
              <Pagination
                total={docsTotalPages}
                value={docsPage}
                onChange={setDocsPage}
                size="sm"
              />
            </Group>
          )}
        </>
      )}
    </Stack>
  );
}
