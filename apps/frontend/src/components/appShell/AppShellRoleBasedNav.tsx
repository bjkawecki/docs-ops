import type { MeResponse } from '../../api/me-types.js';
import type { DepartmentsRes, TeamsRes } from './appShellNavUtils.js';
import { AppShellNavCompanyDepartments } from './AppShellNavCompanyDepartments.js';
import { AppShellNavDepartmentLeadTeams } from './AppShellNavDepartmentLeadTeams.js';
import { AppShellNavMemberScopeLinks } from './AppShellNavMemberScopeLinks.js';
import { AppShellNavNoIdentity } from './AppShellNavNoIdentity.js';

export type AppShellRoleBasedNavProps = {
  pathname: string;
  navLinkStyles: { root: Record<string, unknown> };
  me: MeResponse | undefined;
  isAdmin: boolean;
  isCompanyLead: boolean;
  isDepartmentLead: boolean;
  departmentId: string | undefined;
  userTeamId: string | undefined;
  userDepartmentId: string | undefined;
  companyDepartments: DepartmentsRes | undefined;
  departmentTeams: TeamsRes | undefined;
  companyCount: number | undefined;
  departmentCounts: Record<string, number>;
  teamCounts: Record<string, number>;
  departmentsSectionExpanded: boolean;
  setDepartmentsSectionExpanded: (v: boolean | ((p: boolean) => boolean)) => void;
  teamsSectionExpanded: boolean;
  setTeamsSectionExpanded: (v: boolean | ((p: boolean) => boolean)) => void;
  expandedDepartmentIds: Set<string>;
  setExpandedDepartmentIds: (fn: (prev: Set<string>) => Set<string>) => void;
};

export function AppShellRoleBasedNav({
  pathname,
  navLinkStyles,
  me,
  isAdmin,
  isCompanyLead,
  isDepartmentLead,
  departmentId,
  userTeamId,
  userDepartmentId,
  companyDepartments,
  departmentTeams,
  companyCount,
  departmentCounts,
  teamCounts,
  departmentsSectionExpanded,
  setDepartmentsSectionExpanded,
  teamsSectionExpanded,
  setTeamsSectionExpanded,
  expandedDepartmentIds,
  setExpandedDepartmentIds,
}: AppShellRoleBasedNavProps) {
  if (!me?.identity) {
    return (
      <AppShellNavNoIdentity
        pathname={pathname}
        navLinkStyles={navLinkStyles}
        companyCount={companyCount}
      />
    );
  }

  if ((isCompanyLead || isAdmin) && companyDepartments?.items) {
    return (
      <AppShellNavCompanyDepartments
        pathname={pathname}
        navLinkStyles={navLinkStyles}
        depts={companyDepartments.items}
        companyCount={companyCount}
        departmentCounts={departmentCounts}
        teamCounts={teamCounts}
        departmentsSectionExpanded={departmentsSectionExpanded}
        setDepartmentsSectionExpanded={setDepartmentsSectionExpanded}
        teamsSectionExpanded={teamsSectionExpanded}
        setTeamsSectionExpanded={setTeamsSectionExpanded}
      />
    );
  }

  if (isDepartmentLead && departmentId && departmentTeams?.items) {
    const isTeamsExpanded = expandedDepartmentIds.has(departmentId);
    const toggleTeamsExpanded = () => {
      setExpandedDepartmentIds((prev) => {
        const next = new Set(prev);
        if (next.has(departmentId)) next.delete(departmentId);
        else next.add(departmentId);
        return next;
      });
    };
    return (
      <AppShellNavDepartmentLeadTeams
        pathname={pathname}
        navLinkStyles={navLinkStyles}
        departmentId={departmentId}
        teams={departmentTeams.items}
        companyCount={companyCount}
        departmentCounts={departmentCounts}
        teamCounts={teamCounts}
        isTeamsExpanded={isTeamsExpanded}
        toggleTeamsExpanded={toggleTeamsExpanded}
      />
    );
  }

  return (
    <AppShellNavMemberScopeLinks
      pathname={pathname}
      navLinkStyles={navLinkStyles}
      userDepartmentId={userDepartmentId}
      userTeamId={userTeamId}
      companyCount={companyCount}
      departmentCounts={departmentCounts}
      teamCounts={teamCounts}
    />
  );
}
