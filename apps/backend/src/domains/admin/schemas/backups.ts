import { z } from 'zod';

export const backupDestinationIdParamSchema = z.object({
  id: z.cuid(),
});

export const backupRunIdParamSchema = z.object({
  id: z.cuid(),
});

export const listBackupRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['queued', 'running', 'uploading', 'succeeded', 'failed']).optional(),
});

export const createBackupBodySchema = z.object({
  destinationId: z.cuid().optional(),
});

export const patchBackupSettingsBodySchema = z.object({
  retentionCount: z.number().int().min(1).max(365).optional(),
  defaultDestinationId: z.cuid().nullable().optional(),
});

export const patchBackupScheduleBodySchema = z.object({
  enabled: z.boolean(),
  cron: z.string().min(1).max(120).optional(),
  tz: z.string().min(1).max(64).optional(),
});

const s3DestinationConfigSchema = z.object({
  endpoint: z.url(),
  bucket: z.string().min(1).max(255),
  region: z.string().min(1).max(64).optional(),
  basePath: z.string().max(512).optional(),
  forcePathStyle: z.boolean().optional(),
});

const s3DestinationCredentialsSchema = z.object({
  accessKeyId: z.string().min(1).max(255),
  secretAccessKey: z.string().min(1).max(1024),
});

const sshDestinationConfigSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535).optional(),
  remotePath: z.string().min(1).max(1024),
});

const sshDestinationCredentialsSchema = z.object({
  username: z.string().min(1).max(255),
  password: z.string().max(1024).optional(),
  privateKey: z.string().max(16_384).optional(),
  passphrase: z.string().max(1024).optional(),
});

const webdavDestinationConfigSchema = z.object({
  baseUrl: z.url(),
  remotePath: z.string().max(1024).optional(),
});

const webdavDestinationCredentialsSchema = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(1024),
});

export const createBackupDestinationBodySchema = z.discriminatedUnion('type', [
  z.object({
    name: z.string().min(1).max(120),
    type: z.literal('S3_COMPATIBLE'),
    enabled: z.boolean().optional().default(true),
    config: s3DestinationConfigSchema,
    credentials: s3DestinationCredentialsSchema,
  }),
  z.object({
    name: z.string().min(1).max(120),
    type: z.literal('SSH'),
    enabled: z.boolean().optional().default(true),
    config: sshDestinationConfigSchema,
    credentials: sshDestinationCredentialsSchema,
  }),
  z.object({
    name: z.string().min(1).max(120),
    type: z.literal('WEBDAV'),
    enabled: z.boolean().optional().default(true),
    config: webdavDestinationConfigSchema,
    credentials: webdavDestinationCredentialsSchema,
  }),
]);

export const patchBackupDestinationBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  config: z
    .union([s3DestinationConfigSchema, sshDestinationConfigSchema, webdavDestinationConfigSchema])
    .optional(),
  credentials: z
    .union([
      s3DestinationCredentialsSchema,
      sshDestinationCredentialsSchema,
      webdavDestinationCredentialsSchema,
    ])
    .optional(),
});
