import { isIP } from 'node:net';

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  return false;
}

export function assertSafeRemoteHost(host: string): void {
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) throw new Error('Host is required');
  if (BLOCKED_HOSTNAMES.has(trimmed)) {
    throw new Error('Host is not allowed');
  }
  const ipVersion = isIP(trimmed);
  if (ipVersion === 4 && isPrivateIpv4(trimmed)) {
    throw new Error('Private IPv4 addresses are not allowed');
  }
  if (ipVersion === 6 && isPrivateIpv6(trimmed)) {
    throw new Error('Private IPv6 addresses are not allowed');
  }
}

export function assertSafeHttpsUrl(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Only https URLs are allowed');
  }
  assertSafeRemoteHost(url.hostname);
  return url;
}

export function isInsecureBackupS3DestinationsAllowed(): boolean {
  return (process.env.BACKUP_ALLOW_INSECURE_S3_DESTINATIONS ?? '').toLowerCase() === 'true';
}

export function isInsecureBackupWebDavDestinationsAllowed(): boolean {
  return (process.env.BACKUP_ALLOW_INSECURE_WEBDAV_DESTINATIONS ?? '').toLowerCase() === 'true';
}

/** WebDAV backup destination: HTTPS + SSRF checks unless insecure mode (dev / relay). */
export function assertWebDavDestinationUrl(urlString: string): URL {
  if (isInsecureBackupWebDavDestinationsAllowed()) {
    let url: URL;
    try {
      url = new URL(urlString);
    } catch {
      throw new Error('Invalid URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only http and https URLs are allowed');
    }
    const host = url.hostname.trim().toLowerCase();
    if (BLOCKED_HOSTNAMES.has(host)) {
      throw new Error('Host is not allowed');
    }
    return url;
  }
  return assertSafeHttpsUrl(urlString);
}

/** S3 backup destination endpoint: HTTPS + SSRF checks unless insecure mode is enabled (dev/MinIO). */
export function assertS3BackupDestinationEndpoint(urlString: string): URL {
  if (isInsecureBackupS3DestinationsAllowed()) {
    let url: URL;
    try {
      url = new URL(urlString);
    } catch {
      throw new Error('Invalid URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only http and https URLs are allowed');
    }
    return url;
  }
  return assertSafeHttpsUrl(urlString);
}
