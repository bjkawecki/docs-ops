/**
 * Shared item format for ContextCard; mappable from Process/Project (backend).
 * Optional owner for client-side filter (e.g. owner.companyId === companyId).
 */
export interface ContextCardItem {
  id: string;
  name: string;
  type: 'process' | 'project';
  contextId: string;
  updatedAt?: string;
  documentCount?: number;
  owner?: {
    companyId: string | null;
    departmentId: string | null;
    teamId: string | null;
  };
}
