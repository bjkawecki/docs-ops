import type { GrantRole } from '../../generated/prisma/client.js';

/**
 * Einheitliches Include für Document-Ladungen in canRead/canWrite und requireDocumentAccess.
 * Lädt Context (process/project/subcontext/userSpace) inkl. Owner für Supervisor-Prüfung,
 * sowie alle Grants für die Rechteableitung.
 */
export const DOCUMENT_FOR_PERMISSION_INCLUDE = {
  context: {
    include: {
      process: {
        include: {
          owner: {
            select: {
              departmentId: true,
              teamId: true,
              team: { select: { departmentId: true } },
            },
          },
        },
      },
      project: {
        include: {
          owner: {
            select: {
              departmentId: true,
              teamId: true,
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
                  departmentId: true,
                  teamId: true,
                  team: { select: { departmentId: true } },
                },
              },
            },
          },
        },
      },
      userSpace: {
        select: { ownerUserId: true },
      },
    },
  },
  grantUser: { select: { userId: true, role: true } },
  grantTeam: { select: { teamId: true, role: true } },
  grantDepartment: { select: { departmentId: true, role: true } },
} as const;

/** Owner-Fragment für Supervisor-Prüfung. */
type OwnerFragment = {
  departmentId: string | null;
  teamId: string | null;
  team: { departmentId: string } | null;
};

/** Document, geladen mit DOCUMENT_FOR_PERMISSION_INCLUDE (für canRead/canWrite). */
export type DocumentForPermission = {
  id: string;
  contextId: string;
  context: {
    process: { owner: OwnerFragment } | null;
    project: { owner: OwnerFragment } | null;
    subcontext: { project: { owner: OwnerFragment } } | null;
    userSpace: { ownerUserId: string } | null;
  };
  grantUser: { userId: string; role: GrantRole }[];
  grantTeam: { teamId: string; role: GrantRole }[];
  grantDepartment: { departmentId: string; role: GrantRole }[];
};
