import { useNavigate } from 'react-router-dom';
import { ScopedContextDocumentsList } from '../contextScope/ScopedContextDocumentsList';
import type { ScopedCatalogDocItem } from '../contextScope/contextScopeSharedTypes';

type Props = {
  departmentId: string | undefined;
  docsPending: boolean;
  docsSearch: string;
  setDocsFilter: (key: string, value: string | null) => void;
  docsContextType: string;
  docsTotal: number;
  docsLimit: number;
  setDocsLimit: (value: number) => void;
  departmentDocs: ScopedCatalogDocItem[];
  docsSortBy: string;
  docsSortOrder: string;
  setDocsSort: (col: string) => void;
  docsPage: number;
  docsTotalPages: number;
  setDocsPage: (p: number) => void;
};

export function DepartmentContextDocumentsTab({
  departmentId,
  docsPending,
  docsSearch,
  setDocsFilter,
  docsContextType,
  docsTotal,
  docsLimit,
  setDocsLimit,
  departmentDocs,
  docsSortBy,
  docsSortOrder,
  setDocsSort,
  docsPage,
  docsTotalPages,
  setDocsPage,
}: Props) {
  const navigate = useNavigate();

  return (
    <ScopedContextDocumentsList
      docsPending={docsPending}
      docsSearch={docsSearch}
      setDocsFilter={setDocsFilter}
      docsContextType={docsContextType}
      docsTotal={docsTotal}
      docsLimit={docsLimit}
      setDocsLimit={setDocsLimit}
      documents={departmentDocs}
      docsSortBy={docsSortBy}
      docsSortOrder={docsSortOrder}
      setDocsSort={setDocsSort}
      docsPage={docsPage}
      docsTotalPages={docsTotalPages}
      setDocsPage={setDocsPage}
      emptyMessage="No documents in this department yet. Create a process or project and add documents, or publish drafts from the Drafts tab."
      showPagination={departmentId != null && !docsPending}
      onRowNavigate={(id) => {
        void navigate(`/documents/${id}`);
      }}
    />
  );
}
