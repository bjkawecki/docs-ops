import { describe, expect, it } from 'vitest';
import { inferS3RegionFromEndpoint, resolveS3BackupRegion } from './s3Region.js';

describe('s3Region', () => {
  it('infers eu-central-1 from regional endpoint', () => {
    expect(inferS3RegionFromEndpoint('https://s3.eu-central-1.amazonaws.com')).toBe('eu-central-1');
  });

  it('infers region from virtual-hosted endpoint', () => {
    expect(inferS3RegionFromEndpoint('https://my-bucket.s3.eu-central-1.amazonaws.com')).toBe(
      'eu-central-1'
    );
  });

  it('returns undefined for MinIO-style endpoints', () => {
    expect(inferS3RegionFromEndpoint('http://minio:9000')).toBeUndefined();
  });

  it('prefers inferred AWS region over explicit mismatch', () => {
    expect(resolveS3BackupRegion('https://s3.eu-central-1.amazonaws.com', 'us-east-1')).toBe(
      'eu-central-1'
    );
  });

  it('prefers explicit region', () => {
    expect(resolveS3BackupRegion('https://s3.eu-central-1.amazonaws.com', 'us-west-2')).toBe(
      'eu-central-1'
    );
  });

  it('falls back to inferred region before us-east-1 default', () => {
    expect(resolveS3BackupRegion('https://s3.eu-central-1.amazonaws.com')).toBe('eu-central-1');
  });
});
