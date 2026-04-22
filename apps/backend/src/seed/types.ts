type SeedRow = Record<string, string>;

type SeedCsvData = {
  companies: SeedRow[];
  departments: SeedRow[];
  teams: SeedRow[];
  users: SeedRow[];
  teamMembers: SeedRow[];
  teamLeaders: SeedRow[];
  departmentLeads: SeedRow[];
  companyLeads: SeedRow[];
};

type SeedMasterData = SeedCsvData & {
  companyById: Map<string, string>;
  departmentById: Map<string, string>;
  teamById: Map<string, string>;
  userById: Map<string, string>;
  firstUserEmail?: string;
};

type SeedOwnerData = {
  ownerByCompany: Map<string, string>;
  ownerByDepartment: Map<string, string>;
  ownerByTeam: Map<string, string>;
  ownerByUser: Map<string, string>;
  companyName: string;
  firstTeamName?: string;
};

type SeedContextData = {
  processByScope: Map<string, string>;
  projectByScope: Map<string, string>;
  companyProjectId: string | null;
};

export type { SeedRow, SeedCsvData, SeedMasterData, SeedOwnerData, SeedContextData };
