import type { ScopedCatalogDocItem } from '../contextScope/contextScopeSharedTypes';

export type {
  DeleteTarget,
  EditTarget,
  ProcessItem,
  ProjectItem,
} from '../contextScope/contextScopeSharedTypes';

export type TeamRes = {
  id: string;
  name: string;
  departmentId?: string;
  department?: { id: string; companyId?: string; company?: { id: string } };
};

/** Team-Dokumentenzeile im Katalog (gleiche Form wie firmen-/abteilungs-scoped Katalog). */
export type TeamDocItem = ScopedCatalogDocItem;
