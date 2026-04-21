/** Team-Eintrag in der Identity (mit Rolle). */
export type MeIdentityTeam = {
  teamId: string;
  teamName: string;
  departmentId: string;
  departmentName: string;
  companyId: string;
  role: 'member' | 'leader';
};

/** Response GET /api/v1/me. When impersonating, the response additionally contains impersonation. */
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
    departmentLeads: { id: string; name: string; companyId: string }[];
    companyLeads: { id: string; name: string }[];
  };
  preferences: {
    theme?: 'light' | 'dark' | 'auto';
    sidebarPinned?: boolean;
    scopeRecentPanelOpen?: boolean;
    locale?: 'en' | 'de';
    primaryColor?:
      | 'blue'
      | 'green'
      | 'violet'
      | 'teal'
      | 'indigo'
      | 'amber'
      | 'sky'
      | 'rose'
      | 'orange'
      | 'fuchsia';
    textSize?: 'default' | 'large' | 'larger';
    recentItemsByScope?: Record<
      string,
      { type: 'process' | 'project' | 'document'; id: string; name?: string }[]
    >;
    notificationSettings?: {
      inApp?: {
        documentChanges?: boolean;
        draftRequests?: boolean;
        reminders?: boolean;
      };
      email?: {
        documentChanges?: boolean;
        draftRequests?: boolean;
        reminders?: boolean;
      };
    };
  };
  /** Nur gesetzt, wenn Admin gerade als anderer Nutzer agiert. */
  impersonation?: { active: true; realUser: { id: string; name: string } };
};

/** Response GET /api/v1/me/can-write-in-scope (?scope=company&companyId=...). */
export type CanWriteInScopeResponse = {
  canWrite: boolean;
};
