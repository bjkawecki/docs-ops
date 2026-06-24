import { z } from 'zod';

export const adminSystemUpdateStatusSchema = z.object({
  installedVersion: z.string().min(1),
  updateCheckEnabled: z.boolean(),
  updateCheckConfigured: z.boolean(),
  githubRepo: z.string().nullable(),
  latestVersion: z.string().nullable(),
  latestReleaseTag: z.string().nullable(),
  updateAvailable: z.boolean(),
  releaseUrl: z.url().nullable(),
  checkedAt: z.iso.datetime().nullable(),
  checkError: z.string().nullable(),
});

export type AdminSystemUpdateStatus = z.infer<typeof adminSystemUpdateStatusSchema>;

export const adminSystemCheckUpdatesResponseSchema = z.object({
  status: adminSystemUpdateStatusSchema,
  notificationSent: z.boolean(),
});

export type AdminSystemCheckUpdatesResponse = z.infer<typeof adminSystemCheckUpdatesResponseSchema>;

export const adminSystemSettingsSchema = z.object({
  updateCheckEnabled: z.boolean(),
  updatedAt: z.iso.datetime(),
});

export type AdminSystemSettings = z.infer<typeof adminSystemSettingsSchema>;

export const patchAdminSystemSettingsBodySchema = z.object({
  updateCheckEnabled: z.boolean().optional(),
});

export type PatchAdminSystemSettingsBody = z.infer<typeof patchAdminSystemSettingsBodySchema>;
