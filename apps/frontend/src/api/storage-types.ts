/** Response GET /api/v1/me/storage (personal or with scope). */
export type StorageOverviewResponse = {
  usedBytes: number;
  attachmentCount: number;
  /** Present when scope is team, department, or company (lead view). */
  byUser?: { userId: string; name: string; usedBytes: number }[];
};
