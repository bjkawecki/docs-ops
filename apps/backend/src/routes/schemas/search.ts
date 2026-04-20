import { z } from 'zod';
import { paginationQuerySchema } from './organisation.js';

export const searchDocumentsQuerySchema = paginationQuerySchema.extend({
  q: z.string().min(1).max(300),
  contextType: z.enum(['process', 'project']).optional(),
  companyId: z.string().cuid().optional(),
  departmentId: z.string().cuid().optional(),
  teamId: z.string().cuid().optional(),
});
