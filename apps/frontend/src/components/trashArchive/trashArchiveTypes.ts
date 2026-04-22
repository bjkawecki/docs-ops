export type TrashArchiveItem = {
  type: 'document' | 'process' | 'project';
  id: string;
  displayTitle: string;
  contextName: string;
  deletedAt?: string;
  archivedAt?: string;
};

export type TrashArchiveScope = 'personal' | 'company' | 'department' | 'team';

export interface TrashArchiveTabBaseProps {
  scope: TrashArchiveScope;
  companyId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
}
