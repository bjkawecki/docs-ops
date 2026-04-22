import { z } from 'zod';
import { paginationQuerySchema } from '../../organisation/schemas/organisation.js';

export const searchDocumentsQuerySchema = paginationQuerySchema.extend({
  q: z.string().min(1).max(300),
  contextType: z.enum(['process', 'project']).optional(),
  companyId: z.cuid().optional(),
  departmentId: z.cuid().optional(),
  teamId: z.cuid().optional(),
});
