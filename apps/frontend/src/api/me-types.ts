/** Team-Eintrag in der Identity (mit Rolle). */
export type MeIdentityTeam = {
  teamId: string;
  teamName: string;
  departmentId: string;
  departmentName: string;
  role: 'member' | 'leader';
};

/** Response GET /api/v1/me */
export type MeResponse = {
  user: {
    id: string;
    name: string;
    email: string | null;
    isAdmin: boolean;
    hasLocalLogin: boolean;
  };
  identity: {
    teams: MeIdentityTeam[];
    departments: { id: string; name: string }[];
    supervisorOfDepartments: { id: string; name: string }[];
    userSpaces: { id: string; name: string }[];
  };
  preferences: {
    theme?: 'light' | 'dark' | 'auto';
    sidebarPinned?: boolean;
    locale?: 'en' | 'de';
  };
};
