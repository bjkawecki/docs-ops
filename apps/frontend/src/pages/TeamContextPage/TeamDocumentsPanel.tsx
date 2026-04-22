import { Stack } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { ScopedContextDocumentsList } from '../contextScope/ScopedContextDocumentsList';
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
}: TeamDocumentsPanelProps) {
  const navigate = useNavigate();

  return (
    <Stack gap="md">
      <ScopedContextDocumentsList
        docsPending={docsPending}
        docsSearch={docsSearch}
        setDocsFilter={setDocsFilter}
        docsContextType={docsContextType}
        docsTotal={docsTotal}
        docsLimit={docsLimit}
        setDocsLimit={setDocsLimit}
        documents={teamDocs}
        docsSortBy={docsSortBy}
        docsSortOrder={docsSortOrder}
        setDocsSort={setDocsSort}
        docsPage={docsPage}
        docsTotalPages={docsTotalPages}
        setDocsPage={setDocsPage}
        emptyMessage="No documents in this team yet. Create a process or project and add documents, or publish drafts from the Drafts tab."
        showPagination={teamId != null && !docsPending}
        onRowNavigate={(id) => {
          void navigate(`/documents/${id}`);
        }}
      />
    </Stack>
  );
}
