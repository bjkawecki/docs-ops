import { AdminEntityListToolbar } from '../AdminEntityListToolbar';
import { TEAMS_PAGE_SIZE_KEY } from './adminTeamsTabConstants';

export type AdminTeamsToolbarProps = {
  filterText: string;
  onFilterTextChange: (value: string) => void;
  filterDepartmentId: string | null;
  onFilterDepartmentIdChange: (value: string | null) => void;
  departmentOptions: { value: string; label: string }[];
  companyId: string | null;
  filteredTeamsCount: number;
  limit: number;
  onLimitChange: (next: number) => void;
  onOpenCreate: () => void;
  createDisabled: boolean;
};

export function AdminTeamsToolbar(props: AdminTeamsToolbarProps) {
  const {
    filterText,
    onFilterTextChange,
    filterDepartmentId,
    onFilterDepartmentIdChange,
    departmentOptions,
    companyId,
    filteredTeamsCount,
    limit,
    onLimitChange,
    onOpenCreate,
    createDisabled,
  } = props;

  return (
    <AdminEntityListToolbar
      searchPlaceholder="Search (team, department)"
      filterText={filterText}
      onFilterTextChange={onFilterTextChange}
      scopeSelectPlaceholder="Department"
      scopeSelectData={departmentOptions}
      scopeSelectValue={filterDepartmentId}
      onScopeSelectChange={onFilterDepartmentIdChange}
      scopeSelectDisabled={!companyId}
      countLine={`${filteredTeamsCount} team(s)`}
      limit={limit}
      onLimitChange={onLimitChange}
      pageSizeLocalStorageKey={TEAMS_PAGE_SIZE_KEY}
      createButtonLabel="Create team"
      onOpenCreate={onOpenCreate}
      createDisabled={createDisabled}
    />
  );
}
