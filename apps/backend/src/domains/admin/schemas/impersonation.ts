import { z } from 'zod';

/** Body: POST /admin/impersonate – Ansicht als Nutzer (Ziel-User-ID). */
export const impersonateBodySchema = z.object({
  userId: z.string().min(1),
});
