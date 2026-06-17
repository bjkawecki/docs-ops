import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { parseBackupS3DestinationFromEnv } from '../services/adminBackupDestinationBootstrap.js';

describe('parseBackupS3DestinationFromEnv', () => {
  const keys = [
    'BACKUP_BOOTSTRAP_S3_DESTINATION',
    'BACKUP_ALLOW_INSECURE_S3_DESTINATIONS',
    'BACKUP_S3_DESTINATION_ENDPOINT',
    'BACKUP_S3_DESTINATION_BUCKET',
    'BACKUP_S3_DESTINATION_ACCESS_KEY',
    'BACKUP_S3_DESTINATION_SECRET_KEY',
    'MINIO_ENDPOINT',
    'MINIO_PORT',
    'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY',
  ] as const;

  const snapshot: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of keys) {
      snapshot[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      if (snapshot[key] === undefined) delete process.env[key];
      else process.env[key] = snapshot[key];
    }
  });

  it('returns disabled when bootstrap flag is off', () => {
    expect(parseBackupS3DestinationFromEnv()).toEqual({ enabled: false });
  });

  it('parses config with MinIO fallbacks in insecure mode', () => {
    process.env.BACKUP_BOOTSTRAP_S3_DESTINATION = 'true';
    process.env.BACKUP_ALLOW_INSECURE_S3_DESTINATIONS = 'true';
    process.env.BACKUP_S3_DESTINATION_BUCKET = 'docsops-backups';
    process.env.MINIO_ENDPOINT = 'minio';
    process.env.MINIO_PORT = '9000';
    process.env.MINIO_ACCESS_KEY = 'docsops';
    process.env.MINIO_SECRET_KEY = 'docsopsdev';

    const parsed = parseBackupS3DestinationFromEnv();
    expect(parsed).toMatchObject({
      enabled: true,
      config: {
        name: 'Env default external destination',
        endpoint: 'http://minio:9000',
        bucket: 'docsops-backups',
        accessKeyId: 'docsops',
        secretAccessKey: 'docsopsdev',
        region: 'us-east-1',
        forcePathStyle: true,
      },
    });
  });

  it('requires insecure flag for http endpoints', () => {
    process.env.BACKUP_BOOTSTRAP_S3_DESTINATION = 'true';
    process.env.BACKUP_S3_DESTINATION_BUCKET = 'docsops-backups';
    process.env.BACKUP_S3_DESTINATION_ENDPOINT = 'http://minio:9000';
    process.env.BACKUP_S3_DESTINATION_ACCESS_KEY = 'key';
    process.env.BACKUP_S3_DESTINATION_SECRET_KEY = 'secret';

    const parsed = parseBackupS3DestinationFromEnv();
    expect(parsed).toMatchObject({
      enabled: true,
      missing: ['BACKUP_ALLOW_INSECURE_S3_DESTINATIONS=true for http:// destinations'],
    });
  });
});
