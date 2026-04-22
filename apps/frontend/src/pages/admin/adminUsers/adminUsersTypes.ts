export type UserRole = 'User' | 'Team Lead' | 'Department Lead' | 'Company Lead' | 'Admin';

export type UserTeam = { id: string; name: string; departmentName: string; isLead?: boolean };
export type UserDepartment = { id: string; name: string };

export type UserRow = {
  id: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  role: UserRole;
  deletedAt: string | null;
  teams: UserTeam[];
  departments: UserDepartment[];
  departmentsAsLead?: UserDepartment[];
};

export type ListUsersRes = {
  items: UserRow[];
  total: number;
  limit: number;
  offset: number;
  activeAdminCount: number;
};

export type DepartmentWithTeams = {
  id: string;
  name: string;
  teams: { id: string; name: string }[];
};
export type CompaniesRes = { items: { id: string }[] };
export type DepartmentsRes = { items: DepartmentWithTeams[] };

export type SortByField =
  | 'name'
  | 'email'
  | 'isAdmin'
  | 'deletedAt'
  | 'role'
  | 'teams'
  | 'departments';
export type SortOrder = 'asc' | 'desc';

export type UserStatsRes = {
  storageBytesUsed: number;
  documentsAsWriterCount: number;
  draftsCount: number;
};

export type UserDocumentsRes = {
  items: { id: string; title: string }[];
  total: number;
  limit: number;
  offset: number;
};

export type CreateUserPayload = {
  name: string;
  email: string;
  password: string;
  isAdmin: boolean;
  departmentId?: string | null;
  teamId?: string | null;
  teamRole?: 'member' | 'leader';
  supervisorOfDepartment?: boolean;
};
