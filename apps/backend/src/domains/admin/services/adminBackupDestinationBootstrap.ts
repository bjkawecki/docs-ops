import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { isBackupEncryptionConfigured } from '../../../infrastructure/crypto/secretBox.js';
import { isInsecureBackupS3DestinationsAllowed } from '../../../infrastructure/backup/ssrfGuard.js';
import { createS3Client, ensureBucket } from '../../../infrastructure/storage/s3.js';
import { resolveS3BackupRegion } from '../../../infrastructure/backup/s3Region.js';
import { createBackupDestination, updateBackupSettings } from './adminBackupDestinationService.js';

export type BackupS3DestinationEnvConfig = {
  name: string;
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  basePath?: string;
  region?: string;
  forcePathStyle?: boolean;
};

type BootstrapLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

const defaultLogger: BootstrapLogger = {
  info: (obj, msg) => {
    if (msg) console.log(msg, obj);
    else console.log(obj);
  },
  warn: (obj, msg) => {
    if (msg) console.warn(msg, obj);
    else console.warn(obj);
  },
};

function envTruthy(name: string): boolean {
  return (process.env[name] ?? '').toLowerCase() === 'true';
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function resolveMinioEndpointFromEnv(): string | undefined {
  const endpoint = process.env.MINIO_ENDPOINT ?? process.env.MINIO_HOST;
  if (!endpoint) return undefined;
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const port = process.env.MINIO_PORT ?? '9000';
  return `http://${endpoint}:${port}`;
}

export function parseBackupS3DestinationFromEnv():
  | { enabled: true; config: BackupS3DestinationEnvConfig }
  | { enabled: false }
  | { enabled: true; missing: string[] } {
  if (!envTruthy('BACKUP_BOOTSTRAP_S3_DESTINATION')) {
    return { enabled: false };
  }

  const missing: string[] = [];
  const endpoint = firstNonEmpty(
    process.env.BACKUP_S3_DESTINATION_ENDPOINT,
    resolveMinioEndpointFromEnv()
  );
  const bucket = process.env.BACKUP_S3_DESTINATION_BUCKET?.trim();
  const accessKeyId = firstNonEmpty(
    process.env.BACKUP_S3_DESTINATION_ACCESS_KEY,
    process.env.MINIO_ACCESS_KEY,
    process.env.MINIO_ROOT_USER
  );
  const secretAccessKey = firstNonEmpty(
    process.env.BACKUP_S3_DESTINATION_SECRET_KEY,
    process.env.MINIO_SECRET_KEY,
    process.env.MINIO_ROOT_PASSWORD
  );

  if (!endpoint) missing.push('BACKUP_S3_DESTINATION_ENDPOINT (or MINIO_ENDPOINT)');
  if (!bucket) missing.push('BACKUP_S3_DESTINATION_BUCKET');
  if (!accessKeyId) {
    missing.push('BACKUP_S3_DESTINATION_ACCESS_KEY (or MINIO_ACCESS_KEY)');
  }
  if (!secretAccessKey) {
    missing.push('BACKUP_S3_DESTINATION_SECRET_KEY (or MINIO_SECRET_KEY)');
  }

  if (missing.length > 0) {
    return { enabled: true, missing };
  }

  const insecureEndpoint = endpoint!.startsWith('http://');
  if (insecureEndpoint && !isInsecureBackupS3DestinationsAllowed()) {
    return {
      enabled: true,
      missing: ['BACKUP_ALLOW_INSECURE_S3_DESTINATIONS=true for http:// destinations'],
    };
  }

  const name = process.env.BACKUP_S3_DESTINATION_NAME?.trim() || 'Env default external destination';
  const basePath = process.env.BACKUP_S3_DESTINATION_BASE_PATH?.trim();
  const region = resolveS3BackupRegion(endpoint!, process.env.BACKUP_S3_DESTINATION_REGION?.trim());
  const forcePathStyleRaw = process.env.BACKUP_S3_DESTINATION_FORCE_PATH_STYLE?.toLowerCase();

  return {
    enabled: true,
    config: {
      name,
      endpoint: endpoint!,
      bucket: bucket!,
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      ...(basePath ? { basePath } : {}),
      region,
      ...(forcePathStyleRaw === 'true' || forcePathStyleRaw === 'false'
        ? { forcePathStyle: forcePathStyleRaw === 'true' }
        : { forcePathStyle: true }),
    },
  };
}

async function ensureDestinationBucket(config: BackupS3DestinationEnvConfig): Promise<void> {
  const client = createS3Client({
    endpoint: config.endpoint,
    region: config.region ?? resolveS3BackupRegion(config.endpoint),
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    bucket: config.bucket,
    forcePathStyle: config.forcePathStyle ?? true,
  });
  await ensureBucket(client, config.bucket);
}

export async function ensureDefaultBackupDestinationFromEnv(
  prisma: PrismaClient,
  log: BootstrapLogger = defaultLogger
): Promise<void> {
  const parsed = parseBackupS3DestinationFromEnv();
  if (!parsed.enabled) return;

  if ('missing' in parsed) {
    log.warn({ missing: parsed.missing }, 'Backup S3 bootstrap skipped: incomplete env');
    return;
  }

  const existingCount = await prisma.backupDestination.count();
  if (existingCount > 0) return;

  if (!isBackupEncryptionConfigured()) {
    log.warn({}, 'Backup S3 bootstrap skipped: BACKUP_ENCRYPTION_KEY is not configured');
    return;
  }

  const { config } = parsed;

  try {
    await ensureDestinationBucket(config);
  } catch (error) {
    log.warn({ error }, 'Backup S3 bootstrap: could not ensure destination bucket');
  }

  const destination = await createBackupDestination(prisma, {
    name: config.name,
    type: 'S3_COMPATIBLE',
    enabled: true,
    config: {
      endpoint: config.endpoint,
      bucket: config.bucket,
      ...(config.region ? { region: config.region } : {}),
      ...(config.basePath ? { basePath: config.basePath } : {}),
      ...(config.forcePathStyle != null ? { forcePathStyle: config.forcePathStyle } : {}),
    },
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  await updateBackupSettings(prisma, { defaultDestinationId: destination.id });

  log.info(
    { destinationId: destination.id, name: destination.name, bucket: config.bucket },
    'Bootstrapped default external backup destination from env'
  );
}
