/**
 * Gemeinsames Item-Format für ContextCard; aus Process/Project (Backend) mappbar.
 * Optional owner für clientseitigen Filter (z. B. owner.companyId === companyId).
 */
export interface ContextCardItem {
  id: string;
  name: string;
  type: 'process' | 'project';
  contextId: string;
  owner?: {
    companyId: string | null;
    departmentId: string | null;
    teamId: string | null;
  };
}
