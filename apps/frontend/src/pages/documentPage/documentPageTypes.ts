import type { BlockDocumentV0 } from '../../api/document-types';

export type DocumentScope =
  | { type: 'personal'; name?: string | null }
  | { type: 'company'; id: string; name?: string | null }
  | { type: 'department'; id: string; name?: string | null }
  | { type: 'team'; id: string; name?: string | null };

export type WritersResponse = {
  users: { userId: string; name: string }[];
  teams: { teamId: string; name: string }[];
  departments: { departmentId: string; name: string }[];
};

export type DocumentResponse = {
  id: string;
  title: string;
  content: string;
  /** Lead-Draft-Revision (Block-System, EPIC-8). */
  draftRevision?: number;
  /** Lead-Draft-Blocks; null wenn noch nicht initialisiert. */
  blocks?: BlockDocumentV0 | null;
  publishedBlocks?: BlockDocumentV0 | null;
  publishedBlocksSchemaVersion?: number | null;
  pdfUrl: string | null;
  contextId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  currentPublishedVersionId: string | null;
  currentPublishedVersionNumber: number | null;
  description: string | null;
  createdById: string | null;
  createdByName: string | null;
  writers?: WritersResponse;
  documentTags: { tag: { id: string; name: string } }[];
  canWrite: boolean;
  canDelete: boolean;
  canModerateComments?: boolean;
  canPublish?: boolean;
  scope: DocumentScope | null;
  contextOwnerId?: string | null;
  contextType?: 'process' | 'project' | 'subcontext';
  contextName?: string;
  contextProcessId?: string | null;
  contextProjectId?: string | null;
  contextProjectName?: string | null;
  subcontextId?: string | null;
  subcontextName?: string | null;
};

export type PdfExportJobStatusResponse = {
  jobId: string;
  status: string;
  state: string;
  completedAt: string | null;
  failedAt: string | null;
  pdfReady: boolean;
  downloadUrl: string | null;
  error: string | null;
};

export type ContextOption = {
  id: string;
  contextId: string;
  name: string;
  kind: 'process' | 'project';
};
