/**
 * Re-Export von Prisma-Modelltypen für das Frontend.
 * Eine Quelle (Prisma), Frontend importiert von backend/api-types.
 */
export type {
  ReleaseDetailResponse,
  ReleaseSummary,
  ReleasesListResponse,
  SystemVersionResponse,
} from './domains/system/schemas/releases.js';

export type {
  AdminSystemCheckUpdatesResponse,
  AdminSystemSettings,
  AdminSystemUpdateStatus,
  PatchAdminSystemSettingsBody,
} from './domains/admin/schemas/systemUpdate.js';

export type {
  Company,
  Department,
  Team,
  User,
  Process,
  Project,
  Document,
  Tag,
  Context,
  Subcontext,
  Owner,
} from '../generated/prisma/client.js';
