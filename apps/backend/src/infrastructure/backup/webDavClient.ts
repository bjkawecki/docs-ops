import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { pipeline } from 'node:stream/promises';
import { isInsecureBackupWebDavDestinationsAllowed } from './ssrfGuard.js';

export type WebDavCredentials = {
  username: string;
  password: string;
};

export type WebDavPutOptions = {
  hostHeader?: string;
  contentType?: string;
};

function resolveHostHeader(configured?: string): string | undefined {
  const fromConfig = configured?.trim();
  if (fromConfig) return fromConfig;
  const fromEnv = process.env.DOCSOPS_WEBDAV_DEFAULT_HOST_HEADER?.trim();
  return fromEnv || undefined;
}

/** PUT a local file via WebDAV (streams body; optional Host override for reverse proxies). */
export async function webDavPutFile(
  putUrl: string,
  localFilePath: string,
  credentials: WebDavCredentials,
  options?: WebDavPutOptions
): Promise<{ statusCode: number; body: string }> {
  const url = new URL(putUrl);
  const fileSize = (await stat(localFilePath)).size;
  const isHttps = url.protocol === 'https:';
  const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
  const hostHeader = resolveHostHeader(options?.hostHeader);

  const requestOptions: https.RequestOptions = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    method: 'PUT',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': options?.contentType ?? 'application/octet-stream',
      'Content-Length': fileSize,
      ...(hostHeader ? { Host: hostHeader } : {}),
    },
    ...(isHttps && isInsecureBackupWebDavDestinationsAllowed()
      ? { rejectUnauthorized: false }
      : {}),
  };

  return new Promise((resolve, reject) => {
    const lib = isHttps ? https : http;
    const req = lib.request(requestOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk as Buffer));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    req.on('error', reject);
    void pipeline(createReadStream(localFilePath), req).catch(reject);
  });
}

export function formatWebDavUploadError(statusCode: number, body: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith('<!DOCTYPE html>') || trimmed.startsWith('<html')) {
    return `WebDAV upload failed (${statusCode}): server returned HTML instead of WebDAV. Check base URL, Host header / Nextcloud trusted_domains, and credentials.`;
  }
  const detail = trimmed.slice(0, 200);
  return `WebDAV upload failed (${statusCode}${detail ? `: ${detail}` : ''})`;
}
