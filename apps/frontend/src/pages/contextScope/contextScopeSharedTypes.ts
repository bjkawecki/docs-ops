export type ProcessItem = {
  id: string;
  name: string;
  contextId: string;
  documents?: { id: string; title: string }[];
};

export type ProjectItem = {
  id: string;
  name: string;
  contextId: string;
  documents?: { id: string; title: string }[];
  subcontexts?: { id: string; name: string }[];
};

/** Catalog row for company- or department-scoped document lists. */
export type ScopedCatalogDocItem = {
  id: string;
  title: string;
  contextId: string | null;
  createdAt: string;
  updatedAt: string;
  contextName: string;
};

export type EditTarget = { id: string; name: string; type: 'process' | 'project' };
export type DeleteTarget = { id: string; type: 'process' | 'project' };
