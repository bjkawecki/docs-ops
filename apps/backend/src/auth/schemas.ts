import { z } from 'zod';

/** Schema für den Login-Request-Body (E-Mail + Passwort). */
export const loginBodySchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(1, 'Passwort erforderlich'),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
