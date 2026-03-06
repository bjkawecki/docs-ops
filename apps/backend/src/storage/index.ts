import type { Readable } from 'node:stream';
import type { S3Client } from '@aws-sdk/client-s3';
import {
  createS3Client,
  ensureBucket,
  uploadStream as s3UploadStream,
  getPresignedGetUrl as s3GetPresignedGetUrl,
  getObject as s3GetObject,
  deleteObject as s3DeleteObject,
  getS3ConfigFromEnv,
} from './s3.js';

export type { S3Config } from './s3.js';
export { createS3Client, ensureBucket, getS3ConfigFromEnv } from './s3.js';

/** Storage service bound to a bucket (for use as app.decorate('storage')). */
export interface StorageService {
  readonly bucket: string;
  getPresignedGetUrl(key: string, expiresInSeconds?: number): Promise<string>;
  uploadStream(key: string, body: Readable | Buffer, contentType?: string): Promise<void>;
  getObject(key: string): Promise<{ Body: Readable; ContentType?: string } | null>;
  deleteObject(key: string): Promise<void>;
}

export function createStorageService(client: S3Client, bucket: string): StorageService {
  return {
    bucket,
    getPresignedGetUrl: (key, expiresInSeconds) =>
      s3GetPresignedGetUrl(client, bucket, key, expiresInSeconds),
    uploadStream: (key, body, contentType) =>
      s3UploadStream(client, bucket, key, body, contentType),
    getObject: async (key) => {
      const result = await s3GetObject(client, bucket, key);
      return result as { Body: Readable; ContentType?: string } | null;
    },
    deleteObject: (key) => s3DeleteObject(client, bucket, key),
  };
}

/**
 * Initializes S3 from env and ensures bucket exists. Returns StorageService or null if config missing.
 */
export async function initStorage(): Promise<StorageService | null> {
  const config = getS3ConfigFromEnv();
  if (!config) return null;
  const client = createS3Client(config);
  await ensureBucket(client, config.bucket);
  return createStorageService(client, config.bucket);
}
