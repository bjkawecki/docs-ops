import { describe, expect, it } from 'vitest';
import { formatWebDavUploadError } from './webDavClient.js';

describe('formatWebDavUploadError', () => {
  it('detects HTML error pages from misconfigured WebDAV', () => {
    expect(formatWebDavUploadError(400, '<!DOCTYPE html><html></html>')).toContain(
      'HTML instead of WebDAV'
    );
  });

  it('includes response snippet for XML or plain errors', () => {
    expect(formatWebDavUploadError(401, 'Unauthorized')).toBe(
      'WebDAV upload failed (401: Unauthorized)'
    );
  });
});
