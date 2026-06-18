import type { Destination } from './adminBackupTypes';

export type DestinationFormState = {
  name: string;
  type: 'S3_COMPATIBLE' | 'SSH' | 'WEBDAV';
  enabled: boolean;
  s3Endpoint: string;
  s3Bucket: string;
  s3Region: string;
  s3AccessKey: string;
  s3SecretKey: string;
  sshHost: string;
  sshPort: string;
  sshPath: string;
  sshUser: string;
  sshPassword: string;
  sshPrivateKey: string;
  webdavBaseUrl: string;
  webdavRemotePath: string;
  webdavHostHeader: string;
  webdavUsername: string;
  webdavPassword: string;
};

export const EMPTY_DESTINATION_FORM: DestinationFormState = {
  name: '',
  type: 'S3_COMPATIBLE',
  enabled: true,
  s3Endpoint: '',
  s3Bucket: '',
  s3Region: '',
  s3AccessKey: '',
  s3SecretKey: '',
  sshHost: '',
  sshPort: '22',
  sshPath: '/var/backups/docsops',
  sshUser: '',
  sshPassword: '',
  sshPrivateKey: '',
  webdavBaseUrl: '',
  webdavRemotePath: '',
  webdavHostHeader: '',
  webdavUsername: '',
  webdavPassword: '',
};

function configString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function destinationFormFromDestination(dest: Destination): DestinationFormState {
  const config = dest.configJson;
  if (dest.type === 'S3_COMPATIBLE') {
    return {
      ...EMPTY_DESTINATION_FORM,
      name: dest.name,
      type: 'S3_COMPATIBLE',
      enabled: dest.enabled,
      s3Endpoint: configString(config.endpoint, ''),
      s3Bucket: configString(config.bucket, ''),
      s3Region: configString(config.region, ''),
    };
  }
  if (dest.type === 'SSH') {
    return {
      ...EMPTY_DESTINATION_FORM,
      name: dest.name,
      type: 'SSH',
      enabled: dest.enabled,
      sshHost: configString(config.host, ''),
      sshPort: configString(config.port, '22'),
      sshPath: configString(config.remotePath, '/var/backups/docsops'),
      sshUser: '',
    };
  }
  return {
    ...EMPTY_DESTINATION_FORM,
    name: dest.name,
    type: 'WEBDAV',
    enabled: dest.enabled,
    webdavBaseUrl: configString(config.baseUrl, ''),
    webdavRemotePath: configString(config.remotePath, ''),
    webdavHostHeader: configString(config.hostHeader, ''),
    webdavUsername: '',
  };
}

export function buildDestinationBody(form: DestinationFormState, isEdit: boolean) {
  if (form.type === 'S3_COMPATIBLE') {
    const credentials: Record<string, string> = {};
    if (form.s3AccessKey) credentials.accessKeyId = form.s3AccessKey;
    if (form.s3SecretKey) credentials.secretAccessKey = form.s3SecretKey;
    if (!isEdit && (!credentials.accessKeyId || !credentials.secretAccessKey)) {
      throw new Error('Access key and secret key are required');
    }
    const region = form.s3Region.trim();
    return {
      name: form.name,
      ...(!isEdit ? { type: 'S3_COMPATIBLE' as const, enabled: true } : {}),
      config: {
        endpoint: form.s3Endpoint,
        bucket: form.s3Bucket.trim(),
        ...(region ? { region } : {}),
      },
      ...(Object.keys(credentials).length > 0 ? { credentials } : {}),
    };
  }
  if (form.type === 'WEBDAV') {
    const credentials: Record<string, string> = {};
    if (form.webdavUsername) credentials.username = form.webdavUsername.trim();
    if (form.webdavPassword) credentials.password = form.webdavPassword;
    if (!isEdit && !credentials.username) throw new Error('Username is required');
    if (!isEdit && !credentials.password) throw new Error('Password is required');
    const remotePath = form.webdavRemotePath.trim();
    const hostHeader = form.webdavHostHeader.trim();
    return {
      name: form.name,
      ...(!isEdit ? { type: 'WEBDAV' as const, enabled: true } : {}),
      config: {
        baseUrl: form.webdavBaseUrl.trim(),
        ...(remotePath ? { remotePath } : {}),
        ...(hostHeader ? { hostHeader } : {}),
      },
      ...(Object.keys(credentials).length > 0 ? { credentials } : {}),
    };
  }
  const credentials: Record<string, string> = {};
  if (form.sshUser) credentials.username = form.sshUser;
  if (form.sshPassword) credentials.password = form.sshPassword;
  if (form.sshPrivateKey) credentials.privateKey = form.sshPrivateKey;
  if (!isEdit && !credentials.username) throw new Error('Username is required');
  if (!isEdit && !credentials.password && !credentials.privateKey) {
    throw new Error('Password or private key is required');
  }
  return {
    name: form.name,
    ...(!isEdit ? { type: 'SSH' as const, enabled: true } : {}),
    config: {
      host: form.sshHost,
      port: Number(form.sshPort) || 22,
      remotePath: form.sshPath,
    },
    ...(Object.keys(credentials).length > 0 ? { credentials } : {}),
  };
}
