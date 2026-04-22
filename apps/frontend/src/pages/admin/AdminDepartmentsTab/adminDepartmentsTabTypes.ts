import type { Company, Department } from 'backend/api-types';

export type DepartmentWithCounts = Department & {
  _count?: { teams: number };
  departmentLeads?: { user: { id: string; name: string } }[];
};

export type CompaniesRes = {
  items: (Company & { departments: DepartmentWithCounts[] })[];
  total: number;
  limit: number;
  offset: number;
};

export type DepartmentWithCompany = DepartmentWithCounts & { companyName: string };

export type MemberCountsRes = Record<string, number>;

export type AssignmentListRes = {
  items: { id: string; name: string }[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminUsersRes = {
  items: { id: string; name: string; email: string | null }[];
  total: number;
};

export type DepartmentStatsRes = {
  storageBytesUsed: number;
  teamCount: number;
  memberCount: number;
  documentCount: number;
  processCount: number;
  projectCount: number;
};
