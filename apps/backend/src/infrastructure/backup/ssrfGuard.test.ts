import { describe, expect, it } from 'vitest';
import {
  assertSafeHttpsUrl,
  assertSafeRemoteHost,
  assertS3BackupDestinationEndpoint,
} from './ssrfGuard.js';

describe('ssrfGuard', () => {
  it('allows public hostnames', () => {
    expect(() => assertSafeRemoteHost('s3.amazonaws.com')).not.toThrow();
  });

  it('blocks localhost', () => {
    expect(() => assertSafeRemoteHost('localhost')).toThrow();
  });

  it('blocks private IPv4', () => {
    expect(() => assertSafeRemoteHost('10.0.0.1')).toThrow();
  });

  it('requires https URLs', () => {
    expect(() => assertSafeHttpsUrl('http://example.com')).toThrow();
    const url = assertSafeHttpsUrl('https://s3.example.com');
    expect(url.protocol).toBe('https:');
  });

  it('allows http endpoints in insecure backup mode', () => {
    const previous = process.env.BACKUP_ALLOW_INSECURE_S3_DESTINATIONS;
    process.env.BACKUP_ALLOW_INSECURE_S3_DESTINATIONS = 'true';
    try {
      const url = assertS3BackupDestinationEndpoint('http://minio:9000');
      expect(url.hostname).toBe('minio');
    } finally {
      if (previous === undefined) delete process.env.BACKUP_ALLOW_INSECURE_S3_DESTINATIONS;
      else process.env.BACKUP_ALLOW_INSECURE_S3_DESTINATIONS = previous;
    }
  });
});
