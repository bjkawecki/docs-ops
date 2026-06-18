import type { BackupDestination } from '../../../generated/prisma/client.js';
import { decryptJson } from '../crypto/secretBox.js';
import { createS3Client, uploadFilePath, type S3Config } from '../storage/s3.js';
import {
  assertSafeRemoteHost,
  assertWebDavDestinationUrl,
  assertS3BackupDestinationEndpoint,
} from './ssrfGuard.js';
import { resolveS3BackupRegion } from './s3Region.js';
import { formatWebDavUploadError, webDavPutFile } from './webDavClient.js';
import SftpClient from 'ssh2-sftp-client';

export type S3DestinationConfig = {
  endpoint: string;
  bucket: string;
  region?: string;
  basePath?: string;
  forcePathStyle?: boolean;
};

export type S3DestinationCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
};

export type SshDestinationConfig = {
  host: string;
  port?: number;
  remotePath: string;
};

export type SshDestinationCredentials = {
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
};

export type WebDavDestinationConfig = {
  baseUrl: string;
  remotePath?: string;
  /** Override HTTP Host when URL hostname differs from what the server expects (e.g. reverse proxy). */
  hostHeader?: string;
};

export type WebDavDestinationCredentials = {
  username: string;
  password: string;
};

type ParsedDestination = {
  config: S3DestinationConfig | SshDestinationConfig | WebDavDestinationConfig;
  credentials: S3DestinationCredentials | SshDestinationCredentials | WebDavDestinationCredentials;
};

function parseDestination(destination: BackupDestination): ParsedDestination {
  const config = destination.configJson as ParsedDestination['config'];
  const credentials = decryptJson<ParsedDestination['credentials']>(
    destination.credentialsCiphertext
  );
  return { config, credentials };
}

/** Build PUT URL for WebDAV upload (path segments normalized). */
export function buildWebDavPutUrl(
  baseUrl: string,
  remotePath: string | undefined,
  remoteFileName: string
): string {
  const url = assertWebDavDestinationUrl(baseUrl);
  const pathParts = [
    url.pathname.replace(/\/+$/, ''),
    remotePath?.trim().replace(/^\/+|\/+$/g, '') ?? '',
    remoteFileName.replace(/^\/+/, ''),
  ].filter((part) => part.length > 0);
  const pathname = pathParts.join('/').replace(/\/{2,}/g, '/');
  return `${url.origin}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

async function uploadViaWebDav(
  config: WebDavDestinationConfig,
  credentials: WebDavDestinationCredentials,
  localArchivePath: string,
  remoteFileName: string
): Promise<string> {
  const putUrl = buildWebDavPutUrl(config.baseUrl, config.remotePath, remoteFileName);
  let result: { statusCode: number; body: string };
  try {
    result = await webDavPutFile(putUrl, localArchivePath, credentials, {
      hostHeader: config.hostHeader,
    });
  } catch (error) {
    const cause =
      error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`WebDAV upload request failed: ${message}${cause ? ` (${cause})` : ''}`);
  }

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(formatWebDavUploadError(result.statusCode, result.body));
  }

  return putUrl;
}

export async function uploadBackupArchiveToDestination(
  destination: BackupDestination,
  localArchivePath: string,
  remoteFileName: string
): Promise<string> {
  if (destination.type === 'S3_COMPATIBLE') {
    const { config, credentials } = parseDestination(destination) as {
      config: S3DestinationConfig;
      credentials: S3DestinationCredentials;
    };
    assertS3BackupDestinationEndpoint(config.endpoint);
    const s3Config: S3Config = {
      endpoint: config.endpoint,
      region: resolveS3BackupRegion(config.endpoint, config.region),
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      bucket: config.bucket,
      forcePathStyle: config.forcePathStyle ?? true,
    };
    const client = createS3Client(s3Config);
    const base = config.basePath?.replace(/^\/+|\/+$/g, '') ?? '';
    const key = base ? `${base}/${remoteFileName}` : remoteFileName;
    await uploadFilePath(client, s3Config.bucket, key, localArchivePath, 'application/zstd');
    return key;
  }

  if (destination.type === 'SSH') {
    const { config, credentials } = parseDestination(destination) as {
      config: SshDestinationConfig;
      credentials: SshDestinationCredentials;
    };
    assertSafeRemoteHost(config.host);
    const sftp = new SftpClient();
    const remotePath = config.remotePath.replace(/\/+$/, '');
    const remoteFile = `${remotePath}/${remoteFileName}`;
    try {
      await sftp.connect({
        host: config.host,
        port: config.port ?? 22,
        username: credentials.username,
        password: credentials.password,
        privateKey: credentials.privateKey,
        passphrase: credentials.passphrase,
        readyTimeout: 30_000,
      });
      await sftp.mkdir(remotePath, true);
      await sftp.fastPut(localArchivePath, remoteFile);
      return remoteFile;
    } finally {
      await sftp.end().catch(() => undefined);
    }
  }

  if (destination.type === 'WEBDAV') {
    const { config, credentials } = parseDestination(destination) as {
      config: WebDavDestinationConfig;
      credentials: WebDavDestinationCredentials;
    };
    return uploadViaWebDav(config, credentials, localArchivePath, remoteFileName);
  }

  throw new Error('Unsupported backup destination type');
}
