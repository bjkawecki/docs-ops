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

  it('rejects non-https base URL', () => {
    expect(() =>
      buildWebDavPutUrl('http://cloud.example.com/dav/', undefined, 'archive.tar.zst')
    ).toThrow(/https/i);
  });
});
