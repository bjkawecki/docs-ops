import type { DraftScopeType } from '../../hooks/useMeDrafts';

export type DashboardSearchItem = {
  id: string;
  title: string;
  contextName: string | null;
  contextType: 'process' | 'project' | 'subcontext' | null;
  snippet: string | null;
  updatedAt: string;
  rank: number;
};

export type DashboardSearchResponse = {
  items: DashboardSearchItem[];
  total: number;
  limit: number;
  offset: number;
};

export type PinnedItem = {
  id: string;
  scopeType: 'team' | 'department' | 'company';
  scopeId: string;
  scopeName: string | null;
  documentId: string;
  documentTitle: string;
  documentHref: string;
  order: number;
  pinnedAt: string;
  canUnpin: boolean;
};

export type PinnedResponse = { items: PinnedItem[] };

export type CatalogDocument = {
  id: string;
  title: string;
  updatedAt: string;
  scopeType?: DraftScopeType;
  scopeName?: string;
};

export type CatalogResponse = {
  items: CatalogDocument[];
  total: number;
  limit: number;
  offset: number;
};
