import type { MeDraftsQuery, MeTrashArchiveItem } from '../../schemas/me.js';

type MeNotificationDbRow = {
  id: string;
  event_type: string;
  payload: unknown;
  created_at: Date;
  read_at: Date | null;
};

type RecentPreferencesItem = {
  type: 'process' | 'project' | 'document';
  id: string;
  name?: string;
};

type UserPreferences = {
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
  recentItemsByScope?: Record<string, RecentPreferencesItem[]>;
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

type MeIdentityTeam = {
  teamId: string;
  teamName: string;
  departmentName: string;
  departmentId: string;
  companyId: string;
  role: 'member' | 'leader';
};

type MeResponse = {
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
  preferences: UserPreferences;
  impersonation?: { active: true; realUser: { id: string; name: string } };
};

type OwnerScopeRow = {
  teamId: string | null;
  departmentId: string | null;
  companyId: string | null;
  ownerUserId: string | null;
  displayName: string | null;
};

export type {
  MeDraftsQuery,
  MeTrashArchiveItem,
  MeNotificationDbRow,
  RecentPreferencesItem,
  UserPreferences,
  MeIdentityTeam,
  MeResponse,
  OwnerScopeRow,
};
