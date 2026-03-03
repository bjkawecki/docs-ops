import { z } from 'zod';

/** Schema für den Login-Request-Body (E-Mail + Passwort). */
export const loginBodySchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Passwort erforderlich'),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
