import type { BackupDestination } from '../../../generated/prisma/client.js';
import { decryptJson } from '../crypto/secretBox.js';
import { createS3Client, uploadFilePath, type S3Config } from '../storage/s3.js';
import { assertSafeRemoteHost, assertS3BackupDestinationEndpoint } from './ssrfGuard.js';
import { resolveS3BackupRegion } from './s3Region.js';
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

function parseDestination(destination: BackupDestination): {
  config: S3DestinationConfig | SshDestinationConfig;
  credentials: S3DestinationCredentials | SshDestinationCredentials;
} {
  const config = destination.configJson as S3DestinationConfig | SshDestinationConfig;
  const credentials = decryptJson<S3DestinationCredentials | SshDestinationCredentials>(
    destination.credentialsCiphertext
  );
  return { config, credentials };
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
    const { config, credentials } = parseDestination(destination);
    const sshConfig = config as SshDestinationConfig;
    const sshCreds = credentials as SshDestinationCredentials;
    assertSafeRemoteHost(sshConfig.host);
    const sftp = new SftpClient();
    const remotePath = sshConfig.remotePath.replace(/\/+$/, '');
    const remoteFile = `${remotePath}/${remoteFileName}`;
    try {
      await sftp.connect({
        host: sshConfig.host,
        port: sshConfig.port ?? 22,
        username: sshCreds.username,
        password: sshCreds.password,
        privateKey: sshCreds.privateKey,
        passphrase: sshCreds.passphrase,
        readyTimeout: 30_000,
      });
      await sftp.mkdir(remotePath, true);
      await sftp.fastPut(localArchivePath, remoteFile);
      return remoteFile;
    } finally {
      await sftp.end().catch(() => undefined);
    }
  }

  throw new Error('Unsupported backup destination type');
}
