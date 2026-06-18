import { describe, expect, it } from 'vitest';
import { buildWebDavPutUrl } from './destinationUpload.js';

describe('buildWebDavPutUrl', () => {
  it('appends file name to base URL path', () => {
    expect(
      buildWebDavPutUrl('https://cloud.example.com/dav/backups/', undefined, 'archive.tar.zst')
    ).toBe('https://cloud.example.com/dav/backups/archive.tar.zst');
  });

  it('includes remote path segment', () => {
    expect(
      buildWebDavPutUrl('https://cloud.example.com/dav/', 'docsops/prod', 'archive.tar.zst')
    ).toBe('https://cloud.example.com/dav/docsops/prod/archive.tar.zst');
  });

  it('rejects non-https base URL in secure mode', () => {
    expect(() =>
      buildWebDavPutUrl('http://cloud.example.com/dav/', undefined, 'archive.tar.zst')
    ).toThrow(/https/i);
  });

  it('allows http base URL in insecure dev mode', () => {
    const previous = process.env.BACKUP_ALLOW_INSECURE_WEBDAV_DESTINATIONS;
    process.env.BACKUP_ALLOW_INSECURE_WEBDAV_DESTINATIONS = 'true';
    try {
      expect(buildWebDavPutUrl('http://cloud.local/dav/', undefined, 'archive.tar.zst')).toBe(
        'http://cloud.local/dav/archive.tar.zst'
      );
    } finally {
      if (previous === undefined) delete process.env.BACKUP_ALLOW_INSECURE_WEBDAV_DESTINATIONS;
      else process.env.BACKUP_ALLOW_INSECURE_WEBDAV_DESTINATIONS = previous;
    }
  });
});
