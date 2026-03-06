import type { GrantRole } from '../../generated/prisma/client.js';

/**
 * Unified include for document loads in canRead/canWrite and requireDocumentAccess.
 * Loads context (process/project/subcontext) with owner for lead and personal-owner checks,
 * plus all grants (see docs/platform/datenmodell/Rechtesystem.md).
 */
export const DOCUMENT_FOR_PERMISSION_INCLUDE = {
  context: {
    include: {
      process: {
        include: {
          owner: {
            select: {
              id: true,
              companyId: true,
              departmentId: true,
              teamId: true,
              ownerUserId: true,
              team: { select: { departmentId: true } },
            },
          },
        },
      },
      project: {
        include: {
          owner: {
            select: {
              id: true,
              companyId: true,
              departmentId: true,
              teamId: true,
              ownerUserId: true,
              team: { select: { departmentId: true } },
            },
          },
        },
      },
      subcontext: {
        include: {
          project: {
            include: {
              owner: {
                select: {
                  id: true,
                  companyId: true,
                  departmentId: true,
                  teamId: true,
                  ownerUserId: true,
                  team: { select: { departmentId: true } },
                },
              },
            },
          },
        },
      },
    },
  },
  grantUser: { select: { userId: true, role: true } },
  grantTeam: { select: { teamId: true, role: true } },
  grantDepartment: { select: { departmentId: true, role: true } },
} as const;

/** Owner fragment for lead and personal-owner checks. */
type OwnerFragment = {
  companyId: string | null;
  departmentId: string | null;
  teamId: string | null;
  ownerUserId: string | null;
  team: { departmentId: string } | null;
};

/** Document loaded with DOCUMENT_FOR_PERMISSION_INCLUDE (for canRead/canWrite). */
export type DocumentForPermission = {
  id: string;
  contextId: string | null;
  createdById: string | null;
  context: {
    process: { owner: OwnerFragment } | null;
    project: { owner: OwnerFragment } | null;
    subcontext: { project: { owner: OwnerFragment } } | null;
  } | null;
  grantUser: { userId: string; role: GrantRole }[];
  grantTeam: { teamId: string; role: GrantRole }[];
  grantDepartment: { departmentId: string; role: GrantRole }[];
};
