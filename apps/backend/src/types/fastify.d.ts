import type { PrismaClient } from '../../generated/prisma/client.js';
import type { RequestUser } from '../auth/types.js';
import type { StorageService } from '../storage/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    /** S3/MinIO storage when MINIO_* env is set; null otherwise. */
    storage: StorageService | null;
  }
  interface FastifyRequest {
    user?: RequestUser;
  }
}
