/** Shared types for catalog-style document search (FTS + contains fallback). */

export type SearchDocumentsArgs = {
  query: string;
  limit: number;
  offset: number;
  contextType?: 'process' | 'project';
  companyId?: string;
  departmentId?: string;
  teamId?: string;
  tagIds?: string[];
  publishedOnly?: boolean;
};

export type SearchDocumentItem = {
  id: string;
  title: string;
  contextId: string | null;
  contextName: string | null;
  /**
   * Display kind: `'process'` | `'project'` | `'subcontext'`.
   * Subcontext rows derive `'subcontext'` even though DB `Context.contextType` stays `'project'`.
   */
  contextType: 'process' | 'project' | 'subcontext' | null;
  updatedAt: Date;
  rank: number;
  snippet: string | null;
};
