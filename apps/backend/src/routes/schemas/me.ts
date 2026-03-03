import { z } from 'zod';

/** Body: PATCH /me – eigenes Profil (nur Anzeigename). E-Mail über Account. */
export const patchMeBodySchema = z.object({
  name: z.string().min(1, 'Name erforderlich').max(200),
});

export type PatchMeBody = z.infer<typeof patchMeBodySchema>;

/** Body: PATCH /me/preferences – Theme, Sidebar-Pin, Locale, Zuletzt angesehene pro Scope. */
const recentItemSchema = z.object({
  type: z.enum(['process', 'project', 'document']),
  id: z.string().cuid(),
  name: z.string().max(255).optional(),
});

export const patchPreferencesBodySchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']).optional(),
  sidebarPinned: z.boolean().optional(),
  locale: z.enum(['en', 'de']).optional(),
  recentItemsByScope: z.record(z.string(), z.array(recentItemSchema).max(8)).optional(),
});

export type PatchPreferencesBody = z.infer<typeof patchPreferencesBodySchema>;

const MIN_PASSWORD_LENGTH = 8;

/** Body: PATCH /me/account – E-Mail und/oder Passwort (nur bei lokalem Login). */
export const patchAccountBodySchema = z.object({
  email: z.string().email('Invalid email address').nullable().optional(),
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`)
    .optional(),
});

export type PatchAccountBody = z.infer<typeof patchAccountBodySchema>;
export { MIN_PASSWORD_LENGTH };

/** Params: DELETE /me/sessions/:sessionId */
export const sessionIdParamSchema = z.object({
  sessionId: z.string().min(1, 'Session-ID erforderlich'),
});
export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;
