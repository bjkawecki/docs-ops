import { AdminEntityListToolbar } from '../AdminEntityListToolbar';
import { DEPARTMENTS_PAGE_SIZE_KEY } from './adminDepartmentsTabConstants';

export type AdminDepartmentsToolbarProps = {
  filterText: string;
  onFilterTextChange: (value: string) => void;
  filterCompanyId: string | null;
  onFilterCompanyIdChange: (value: string | null) => void;
  companyOptions: { value: string; label: string }[];
  filteredDepartmentsCount: number;
  limit: number;
  onLimitChange: (next: number) => void;
  onOpenCreate: () => void;
  createDisabled: boolean;
};

export function AdminDepartmentsToolbar(props: AdminDepartmentsToolbarProps) {
  const {
    filterText,
    onFilterTextChange,
    filterCompanyId,
    onFilterCompanyIdChange,
    companyOptions,
    filteredDepartmentsCount,
    limit,
    onLimitChange,
    onOpenCreate,
    createDisabled,
  } = props;

  return (
    <AdminEntityListToolbar
      searchPlaceholder="Search (department, company)"
      filterText={filterText}
      onFilterTextChange={onFilterTextChange}
      scopeSelectPlaceholder="Company"
      scopeSelectData={companyOptions}
      scopeSelectValue={filterCompanyId}
      onScopeSelectChange={onFilterCompanyIdChange}
      countLine={`${filteredDepartmentsCount} department(s)`}
      limit={limit}
      onLimitChange={onLimitChange}
      pageSizeLocalStorageKey={DEPARTMENTS_PAGE_SIZE_KEY}
      createButtonLabel="Create department"
      onOpenCreate={onOpenCreate}
      createDisabled={createDisabled}
    />
  );
}
