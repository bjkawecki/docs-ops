export type ScopePersonRow = {
  id: string;
  name: string;
  roles?: ('member' | 'lead')[];
  isOnline: boolean;
  lastActiveAt: string | null;
};

export type TeamPeopleResponse = {
  items: ScopePersonRow[];
  total: number;
  onlineCount: number;
};

export type DepartmentPeopleResponse = {
  departmentLeads: ScopePersonRow[];
  teams: Array<{
    id: string;
    name: string;
    teamLeads: ScopePersonRow[];
    members: ScopePersonRow[];
  }>;
  summary: { peopleCount: number; onlineCount: number; teamCount: number };
};

export type CompanyPeopleResponse = {
  companyLeads: ScopePersonRow[];
  departments: Array<{
    id: string;
    name: string;
    departmentLeads: ScopePersonRow[];
    teams: Array<{
      id: string;
      name: string;
      peopleCount: number;
      onlineCount: number;
    }>;
    peopleCount: number;
    onlineCount: number;
    teamCount: number;
  }>;
  summary: { peopleCount: number; onlineCount: number; departmentCount: number };
};
