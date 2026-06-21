import { describe, it, expect } from 'vitest';
import { evaluateScopeCapability, type ScopeHierarchy } from './scopeVisibility.js';
import type { LoadedUser } from './userAccessPredicates.js';

const COMPANY = 'company-1';
const DEPARTMENT = 'dept-1';
const TEAM = 'team-1';

function emptyUser(overrides: Partial<LoadedUser> = {}): LoadedUser {
  return {
    id: 'user-1',
    isAdmin: false,
    deletedAt: null,
    teamMemberships: [],
    leadOfTeams: [],
    departmentLeads: [],
    companyLeads: [],
    ...overrides,
  } as LoadedUser;
}

function companyLeadUser(): LoadedUser {
  return emptyUser({ companyLeads: [{ companyId: COMPANY }] });
}

function departmentLeadUser(): LoadedUser {
  return emptyUser({
    departmentLeads: [{ departmentId: DEPARTMENT, department: { companyId: COMPANY } }],
  });
}

function teamLeadUser(): LoadedUser {
  return emptyUser({
    leadOfTeams: [
      { teamId: TEAM, team: { departmentId: DEPARTMENT, department: { companyId: COMPANY } } },
    ],
  });
}

function teamMemberUser(): LoadedUser {
  return emptyUser({
    teamMemberships: [
      { team: { id: TEAM, departmentId: DEPARTMENT, department: { companyId: COMPANY } } },
    ],
  });
}

const teamHierarchy: ScopeHierarchy = {
  teamId: TEAM,
  departmentId: DEPARTMENT,
  companyId: COMPANY,
};
const deptHierarchy: ScopeHierarchy = { departmentId: DEPARTMENT, companyId: COMPANY };
const companyHierarchy: ScopeHierarchy = { companyId: COMPANY };

describe('evaluateScopeCapability', () => {
  describe('view', () => {
    it('admin can view any scope', () => {
      const admin = emptyUser({ isAdmin: true });
      expect(evaluateScopeCapability(admin, teamHierarchy, 'view')).toBe(true);
      expect(evaluateScopeCapability(admin, companyHierarchy, 'view')).toBe(true);
    });

    it('company lead can view team without membership', () => {
      expect(evaluateScopeCapability(companyLeadUser(), teamHierarchy, 'view')).toBe(true);
      expect(evaluateScopeCapability(companyLeadUser(), deptHierarchy, 'view')).toBe(true);
    });

    it('department lead can view team in department', () => {
      expect(evaluateScopeCapability(departmentLeadUser(), teamHierarchy, 'view')).toBe(true);
    });

    it('team member can view team but plain company member cannot lead company', () => {
      expect(evaluateScopeCapability(teamMemberUser(), teamHierarchy, 'view')).toBe(true);
      expect(evaluateScopeCapability(teamMemberUser(), companyHierarchy, 'lead')).toBe(false);
    });

    it('outsider cannot view team', () => {
      expect(evaluateScopeCapability(emptyUser(), teamHierarchy, 'view')).toBe(false);
    });
  });

  describe('lead', () => {
    it('company lead is scope lead for company, department, and team', () => {
      const user = companyLeadUser();
      expect(evaluateScopeCapability(user, companyHierarchy, 'lead')).toBe(true);
      expect(evaluateScopeCapability(user, deptHierarchy, 'lead')).toBe(true);
      expect(evaluateScopeCapability(user, teamHierarchy, 'lead')).toBe(true);
    });

    it('plain company member is not scope lead', () => {
      const member = teamMemberUser();
      expect(evaluateScopeCapability(member, companyHierarchy, 'lead')).toBe(false);
      expect(evaluateScopeCapability(member, teamHierarchy, 'lead')).toBe(false);
    });

    it('team lead is scope lead for team only among non-admin roles', () => {
      const user = teamLeadUser();
      expect(evaluateScopeCapability(user, teamHierarchy, 'lead')).toBe(true);
      expect(evaluateScopeCapability(user, deptHierarchy, 'lead')).toBe(false);
    });
  });

  describe('readOwner', () => {
    it('matches view hierarchy rules', () => {
      expect(evaluateScopeCapability(companyLeadUser(), teamHierarchy, 'readOwner')).toBe(true);
      expect(evaluateScopeCapability(teamMemberUser(), teamHierarchy, 'readOwner')).toBe(true);
      expect(evaluateScopeCapability(emptyUser(), teamHierarchy, 'readOwner')).toBe(false);
    });
  });
});
