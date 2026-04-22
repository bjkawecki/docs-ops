import { Card, Stack, Text } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { ScopedContextDocumentsList } from '../contextScope/ScopedContextDocumentsList';
import type { ScopedCatalogDocItem } from '../contextScope/contextScopeSharedTypes';

type Props = {
  effectiveCompanyId: string | null | undefined;
  docsPending: boolean;
  docsSearch: string;
  setDocsFilter: (key: string, value: string | null) => void;
  docsContextType: string;
  docsTotal: number;
  docsLimit: number;
  setDocsLimit: (value: number) => void;
  companyDocs: ScopedCatalogDocItem[];
  docsSortBy: string;
  docsSortOrder: string;
  setDocsSort: (col: string) => void;
  docsPage: number;
  docsTotalPages: number;
  setDocsPage: (p: number) => void;
};

export function CompanyPageDocumentsTab({
  effectiveCompanyId,
  docsPending,
  docsSearch,
  setDocsFilter,
  docsContextType,
  docsTotal,
  docsLimit,
  setDocsLimit,
  companyDocs,
  docsSortBy,
  docsSortOrder,
  setDocsSort,
  docsPage,
  docsTotalPages,
  setDocsPage,
}: Props) {
  const navigate = useNavigate();

  if (effectiveCompanyId == null) {
    return (
      <Stack gap="md">
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            No company selected.
          </Text>
        </Card>
      </Stack>
    );
  }

  return (
    <ScopedContextDocumentsList
      docsPending={docsPending}
      docsSearch={docsSearch}
      setDocsFilter={setDocsFilter}
      docsContextType={docsContextType}
      docsTotal={docsTotal}
      docsLimit={docsLimit}
      setDocsLimit={setDocsLimit}
      documents={companyDocs}
      docsSortBy={docsSortBy}
      docsSortOrder={docsSortOrder}
      setDocsSort={setDocsSort}
      docsPage={docsPage}
      docsTotalPages={docsTotalPages}
      setDocsPage={setDocsPage}
      emptyMessage="No documents."
      showPagination={effectiveCompanyId != null && !docsPending}
      onRowNavigate={(id) => {
        void navigate(`/documents/${id}`);
      }}
    />
  );
}
