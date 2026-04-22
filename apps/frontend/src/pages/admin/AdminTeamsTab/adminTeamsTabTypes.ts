import type { Company, Department, Team } from 'backend/api-types';

export type DepartmentsRes = {
  items: (Department & { teams: Team[] })[];
  total: number;
  limit: number;
  offset: number;
};

export type CompaniesRes = { items: Company[]; total: number; limit: number; offset: number };

export type AssignmentItem = { id: string; name: string };

export type AssignmentListRes = {
  items: AssignmentItem[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminUsersRes = {
  items: { id: string; name: string; email: string | null }[];
  total: number;
};

export type TeamStatsRes = {
  storageBytesUsed: number;
  memberCount: number;
  documentCount: number;
  processCount: number;
  projectCount: number;
};

export type TeamWithDept = Team & { departmentId: string; departmentName: string };

export type TeamBatchRow = { memberCount: number; leadNames: string[] };
