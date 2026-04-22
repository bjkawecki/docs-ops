export function isActive(path: string, current: string): boolean {
  if (path === '/') return current === '/';
  return current === path || current.startsWith(path + '/');
}

/** Shared styles for sidebar nav links (hover/active). Uses theme variables. */
export function getNavLinkStyles(): { root: Record<string, unknown> } {
  return {
    root: {
      borderRadius: 'var(--mantine-radius-sm)',
      padding: '6px 12px',
      fontWeight: 400,
      fontSize: 'var(--mantine-font-size-md)',
    },
  };
}

/** Rolle aus MeResponse ableiten (gleiche Reihenfolge wie Backend: Admin > Company Lead > Department Lead > Team Lead > User). */
export function getDisplayRole(me: {
  user: { isAdmin: boolean };
  identity: { companyLeads: unknown[]; departmentLeads: unknown[]; teams: { role: string }[] };
}): string {
  if (me.user.isAdmin) return 'Admin';
  if ((me.identity.companyLeads?.length ?? 0) > 0) return 'Company Lead';
  if ((me.identity.departmentLeads?.length ?? 0) > 0) return 'Department Lead';
  if (me.identity.teams?.some((t) => t.role === 'leader')) return 'Team Lead';
  return 'User';
}

export type DepartmentWithTeams = {
  id: string;
  name: string;
  teams: { id: string; name: string }[];
};
export type DepartmentsRes = { items: DepartmentWithTeams[]; total: number };
export type TeamsRes = { items: { id: string; name: string }[]; total: number };

export type AdminUser = {
  id: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  deletedAt: Date | null;
  role: 'User' | 'Team Lead' | 'Department Lead' | 'Company Lead' | 'Admin';
};
