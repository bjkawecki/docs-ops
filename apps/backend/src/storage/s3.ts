import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';

const DEFAULT_EXPIRES_IN = 60;

export interface S3Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle?: boolean;
}

export function createS3Client(config: S3Config): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle ?? true,
  });
}

/**
 * Ensures the bucket exists; creates it if missing. Call once at app startup or first use.
 */
export async function ensureBucket(client: S3Client, bucket: string): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (err: unknown) {
    const status =
      err && typeof err === 'object' && '$metadata' in err
        ? (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined;
    const name =
      err && typeof err === 'object' && 'name' in err ? (err as { name: string }).name : '';
    if (status === 404 || name === 'NotFound' || name === 'NoSuchBucket') {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    } else {
      throw err;
    }
  }
}

/**
 * Upload a stream to S3. Returns the key used.
 */
export async function uploadStream(
  client: S3Client,
  bucket: string,
  key: string,
  body: Readable | Buffer,
  contentType?: string
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType ?? undefined,
    })
  );
}

/**
 * Returns a presigned GET URL for the object (e.g. 302 redirect target).
 */
export async function getPresignedGetUrl(
  client: S3Client,
  bucket: string,
  key: string,
  expiresInSeconds: number = DEFAULT_EXPIRES_IN
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/**
 * Get object stream (for proxy download). Caller must consume the stream.
 */
export async function getObject(
  client: S3Client,
  bucket: string,
  key: string
): Promise<{ Body: ReadableStream | Readable | Blob; ContentType?: string } | null> {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (response.Body == null) return null;
  return {
    Body: response.Body as Readable,
    ContentType: response.ContentType ?? undefined,
  };
}

/**
 * Delete an object from the bucket.
 */
export async function deleteObject(client: S3Client, bucket: string, key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export function getS3ConfigFromEnv(): S3Config | null {
  const endpoint = process.env.MINIO_ENDPOINT ?? process.env.MINIO_HOST;
  const port = process.env.MINIO_PORT ?? '9000';
  const accessKeyId = process.env.MINIO_ACCESS_KEY ?? process.env.MINIO_ROOT_USER;
  const secretAccessKey = process.env.MINIO_SECRET_KEY ?? process.env.MINIO_ROOT_PASSWORD;
  const bucket = process.env.MINIO_BUCKET ?? 'documents';
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;
  const url = endpoint.startsWith('http')
    ? endpoint
    : `http://${endpoint}${port ? `:${port}` : ''}`;
  return {
    endpoint: url,
    region: process.env.MINIO_REGION ?? 'us-east-1',
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle: true,
  };
}
